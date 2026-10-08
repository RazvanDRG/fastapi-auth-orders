import asyncio
import logging
import threading
import time
from types import SimpleNamespace

import pytest

import app.main  # noqa: F401 - configures the "app" logger handler and formatter
from app.core.config import settings
from app.services import kafka_producer, outbox_service

# In-process only: no database (fake session) and no Kafka (fake producer).


@pytest.fixture
def app_logs(caplog):
    # The "app" logger does not propagate to root, so attach caplog directly
    app_logger = logging.getLogger("app")
    app_logger.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger="app")
    yield caplog
    app_logger.removeHandler(caplog.handler)


@pytest.fixture(autouse=True)
def no_producer(monkeypatch):
    monkeypatch.setattr(kafka_producer, "_producer", None)
    monkeypatch.setattr(kafka_producer, "_connect_task", None)


class FakeSession:
    """Records every call; a pass without a producer must make none."""

    def __init__(self, pending_rows):
        self.pending_rows = pending_rows
        self.calls = []

    def __getattr__(self, name):
        def record(*args, **kwargs):
            self.calls.append(name)
            raise AssertionError(f"db.{name}() called")

        return record


def test_outbox_pass_without_producer_returns_fast_and_leaves_rows_pending(app_logs):
    rows = [SimpleNamespace(id=i, published=False, published_at=None) for i in range(500)]
    db = FakeSession(rows)

    start = time.perf_counter()
    published = asyncio.run(outbox_service.publish_pending_outbox_events(db))
    elapsed = time.perf_counter() - start

    assert published == 0
    assert elapsed < 0.5
    assert db.calls == []
    assert all(r.published is False and r.published_at is None for r in rows)
    assert not [r for r in app_logs.records if r.getMessage() == "kafka_publish_skipped"]


def test_outbox_db_work_runs_off_the_event_loop_thread(monkeypatch):
    monkeypatch.setattr(kafka_producer, "_producer", object())
    loop_thread = threading.get_ident()
    db_threads = []
    row = SimpleNamespace(
        id=1,
        event_type="wms.order.audit",
        occurred_at=SimpleNamespace(isoformat=lambda: "2026-10-08T00:00:00+00:00"),
        order_id=7,
        request_id="rid",
        payload="{}",
        published=False,
        published_at=None,
    )
    pending = [row]

    def fake_claim(db, failed_ids):
        db_threads.append(threading.get_ident())
        return pending.pop() if pending else None

    def fake_mark(db, r):
        db_threads.append(threading.get_ident())
        r.published = True

    async def fake_publish(topic, event):
        assert threading.get_ident() == loop_thread

    monkeypatch.setattr(outbox_service, "_claim_next_row", fake_claim)
    monkeypatch.setattr(outbox_service, "_mark_published", fake_mark)
    monkeypatch.setattr(outbox_service, "publish_event", fake_publish)

    published = asyncio.run(outbox_service.publish_pending_outbox_events(object()))

    assert published == 1
    assert row.published is True
    assert db_threads and loop_thread not in db_threads


class FlakyProducer:
    """Fails to start the first `failures` times, like Kafka being down."""

    failures = 0
    starts = 0

    def __init__(self, **kwargs):
        self.stopped = False

    async def start(self):
        FlakyProducer.starts += 1
        if FlakyProducer.starts <= FlakyProducer.failures:
            raise ConnectionError("kafka unreachable")

    async def stop(self):
        self.stopped = True


def test_producer_connects_on_retry_after_failed_attempts(monkeypatch, app_logs):
    FlakyProducer.failures = 2
    FlakyProducer.starts = 0
    monkeypatch.setattr(kafka_producer, "AIOKafkaProducer", FlakyProducer)
    monkeypatch.setattr(kafka_producer, "_build_ssl_context", lambda: None)
    monkeypatch.setattr(settings, "kafka_bootstrap_servers", "fake:9092")
    monkeypatch.setattr(kafka_producer, "RETRY_INITIAL_DELAY_S", 0.01)
    monkeypatch.setattr(kafka_producer, "RETRY_MAX_DELAY_S", 0.015)

    async def scenario():
        await kafka_producer.start_kafka_producer()
        # Startup does not wait for Kafka: the connection happens in the background
        assert not kafka_producer.is_producer_started()

        await asyncio.wait_for(kafka_producer._connect_task, timeout=2)
        assert kafka_producer.is_producer_started()

        await kafka_producer.stop_kafka_producer()
        assert not kafka_producer.is_producer_started()

    asyncio.run(scenario())

    failed = [r for r in app_logs.records if r.getMessage() == "kafka_producer_start_failed"]
    assert [r.levelno for r in failed] == [logging.WARNING, logging.WARNING]
    assert [r.attempt for r in failed] == [1, 2]
    # Doubles, capped at the max
    assert [r.retry_in_s for r in failed] == [0.01, 0.015]

    started = [r for r in app_logs.records if r.getMessage() == "kafka_producer_started"]
    assert len(started) == 1
    assert started[0].attempt == 3


def test_app_log_line_includes_extra_fields():
    formatter = logging.getLogger("app").handlers[0].formatter
    record = logging.getLogger("app").makeRecord(
        "app", logging.INFO, __file__, 1, "outbox_events_published", (), None,
        extra={"published_events": 3},
    )

    line = formatter.format(record)

    assert "INFO app outbox_events_published" in line
    assert line.endswith("published_events=3")


def test_archive_worker_db_work_runs_off_the_event_loop_thread(monkeypatch):
    calls = []

    class FakeDb:
        def close(self):
            calls.append(("close", threading.get_ident()))

    def fake_archive(db):
        calls.append(("archive", threading.get_ident()))
        return 2

    monkeypatch.setattr(app.main, "SessionLocal", FakeDb)
    monkeypatch.setattr(app.main, "archive_due_orders", fake_archive)

    async def scenario():
        loop_thread = threading.get_ident()
        task = asyncio.create_task(app.main.archive_orders_worker())
        # One pass, then the worker sits in its 60s sleep
        for _ in range(200):
            if len(calls) >= 2:
                break
            await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        return loop_thread

    loop_thread = asyncio.run(scenario())

    assert [name for name, _ in calls] == ["archive", "close"]
    assert all(tid != loop_thread for _, tid in calls)

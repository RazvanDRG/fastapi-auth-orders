import asyncio
import json
import logging
import ssl

from aiokafka import AIOKafkaProducer

from app.core.config import settings

logger = logging.getLogger("app")

# Module-level singleton, started/stopped from app lifespan (main.py),
# same pattern as the existing archive worker.
_producer: AIOKafkaProducer | None = None

# aiokafka's own request_timeout_ms defaults to 40000ms - too slow for a
# missing/misconfigured topic, since publish_pending_outbox_events() awaits
# each row sequentially and one bad row would stall the whole pass for 40s+
# (observed during manual testing). Bound each publish attempt independently.
PUBLISH_TIMEOUT_S = 8

# Background reconnect: 5s, doubling up to 5 min. Each start attempt is
# bounded so a hanging bootstrap cannot stall the retry loop.
RETRY_INITIAL_DELAY_S = 5
RETRY_MAX_DELAY_S = 300
START_TIMEOUT_S = 30

_connect_task: asyncio.Task | None = None


def _build_ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=settings.kafka_ssl_ca_path)


async def _connect_with_retry() -> None:
    global _producer

    delay = RETRY_INITIAL_DELAY_S
    attempt = 0

    while True:
        attempt += 1
        producer = None
        try:
            producer = AIOKafkaProducer(
                bootstrap_servers=settings.kafka_bootstrap_servers,
                security_protocol="SASL_SSL",
                sasl_mechanism="PLAIN",
                sasl_plain_username=settings.kafka_username,
                sasl_plain_password=settings.kafka_password,
                ssl_context=_build_ssl_context(),
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            await asyncio.wait_for(producer.start(), timeout=START_TIMEOUT_S)
            _producer = producer
            logger.info("kafka_producer_started", extra={"attempt": attempt})
            return
        except Exception as exc:
            # Kafka being unreachable (cluster paused, wrong creds, missing
            # cert, network) must not take the API down: keep serving and
            # retry in the background.
            logger.warning(
                "kafka_producer_start_failed",
                extra={"attempt": attempt, "retry_in_s": delay, "error": repr(exc)},
            )
            if producer is not None:
                # A failed start can leave the client half-open
                try:
                    await producer.stop()
                except Exception:
                    pass

        await asyncio.sleep(delay)
        delay = min(delay * 2, RETRY_MAX_DELAY_S)


def is_producer_started() -> bool:
    return _producer is not None


async def start_kafka_producer() -> None:
    """Start connecting in the background, so app startup never waits on Kafka."""
    global _connect_task

    if not settings.kafka_bootstrap_servers:
        logger.warning("kafka_producer_disabled", extra={"reason": "no bootstrap servers configured"})
        return

    if _connect_task is None or _connect_task.done():
        _connect_task = asyncio.create_task(_connect_with_retry())


async def stop_kafka_producer() -> None:
    global _producer, _connect_task

    if _connect_task is not None:
        _connect_task.cancel()
        try:
            await _connect_task
        except asyncio.CancelledError:
            pass
        _connect_task = None

    if _producer is not None:
        await _producer.stop()
        _producer = None
        logger.info("kafka_producer_stopped")


async def publish_event(topic: str, event: dict) -> None:
    """
    Publish a single event to a Kafka topic. Fire-and-forget from the caller's
    perspective (no response awaited from any consumer) - matches the
    decoupling goal described in the architecture plan (Section 7).
    """
    if _producer is None:
        # Raise instead of returning: the outbox worker treats a clean return
        # as delivered and would mark the row published, losing the event.
        logger.warning("kafka_publish_skipped", extra={"topic": topic, "reason": "producer not started"})
        raise RuntimeError("Kafka producer not started")

    try:
        await asyncio.wait_for(_producer.send_and_wait(topic, event), timeout=PUBLISH_TIMEOUT_S)
        logger.info("kafka_event_published", extra={"topic": topic, "event_type": event.get("event_type")})
    except Exception:
        logger.exception("kafka_publish_failed", extra={"topic": topic})
        raise
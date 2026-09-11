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


def _build_ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=settings.kafka_ssl_ca_path)


async def start_kafka_producer() -> None:
    global _producer

    if not settings.kafka_bootstrap_servers:
        logger.warning("kafka_producer_disabled", extra={"reason": "no bootstrap servers configured"})
        return

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
        await producer.start()
        _producer = producer
        logger.info("kafka_producer_started")
    except Exception:
        # Kafka being unreachable (cluster paused, wrong creds, missing cert,
        # network) must not take the whole API down - the app should still
        # start, just without event publishing until this is fixed.
        logger.exception("kafka_producer_start_failed")
        _producer = None


async def stop_kafka_producer() -> None:
    global _producer

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
        logger.warning("kafka_publish_skipped", extra={"topic": topic, "reason": "producer not started"})
        return

    try:
        await asyncio.wait_for(_producer.send_and_wait(topic, event), timeout=PUBLISH_TIMEOUT_S)
        logger.info("kafka_event_published", extra={"topic": topic, "event_type": event.get("event_type")})
    except Exception:
        logger.exception("kafka_publish_failed", extra={"topic": topic})
        raise
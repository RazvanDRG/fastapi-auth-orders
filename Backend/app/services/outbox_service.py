import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.outbox_event import OutboxEvent
from app.services.kafka_producer import publish_event


async def publish_pending_outbox_events(db: Session) -> int:
    """
    Single pass: read unsent outbox rows and publish them to Kafka, one at a
    time, wrapped now (Day 5) in a while-loop worker on app lifespan, same
    pattern as archive_orders_worker().

    Commits after each successful publish rather than once at the end of the
    batch: if the worker dies mid-pass (crash, restart), rows already
    published stay published=True instead of the whole pass being lost and
    re-sent - observed during Day 4 manual testing, where killing the process
    mid-loop discarded an already-acked publish because nothing had committed
    yet.
    """
    pending = (
        db.query(OutboxEvent)
        .filter(OutboxEvent.published.is_(False))
        .order_by(OutboxEvent.occurred_at.asc())
        .all()
    )

    published_count = 0

    for row in pending:
        event = {
            "event_id": str(row.id),
            "event_type": row.event_type,
            "occurred_at": row.occurred_at.isoformat(),
            "order_id": row.order_id,
            "request_id": row.request_id,
            "payload": json.loads(row.payload),
        }

        # Topic name matches event_type 1:1 (Section 7.4 of the architecture:
        # wms.stock.reserved, wms.stock.released, wms.pick.completed, wms.order.audit)
        topic = row.event_type

        try:
            await publish_event(topic, event)
            row.published = True
            row.published_at = datetime.now(timezone.utc)
            db.commit()
            published_count += 1
        except Exception:
            # Leave unpublished - the next poll pass retries it. This is the
            # at-least-once delivery guarantee the outbox pattern exists for.
            db.rollback()
            continue

    return published_count
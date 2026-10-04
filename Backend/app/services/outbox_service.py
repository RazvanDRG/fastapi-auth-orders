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

    Claims one row at a time with FOR UPDATE SKIP LOCKED, so two replicas
    never publish the same row. Locking the whole batch up front would not
    work: the per-row commit releases every lock, not just the current one.
    """
    published_count = 0
    failed_ids = []

    while True:
        query = db.query(OutboxEvent).filter(OutboxEvent.published.is_(False))
        if failed_ids:
            # Skip rows that already failed in this pass, retried on the next poll.
            query = query.filter(OutboxEvent.id.notin_(failed_ids))

        row = (
            query.order_by(OutboxEvent.occurred_at.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if row is None:
            break

        row_id = row.id
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
            failed_ids.append(row_id)

    return published_count
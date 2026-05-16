from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.order import Order


def archive_due_orders(db: Session) -> int:
    now = datetime.now(timezone.utc)

    orders = (
        db.query(Order)
        .filter(
            Order.archive_due_at.isnot(None),
            Order.archived_at.is_(None),
            Order.archive_due_at <= now,
        )
        .all()
    )

    for order in orders:
        order.archived_at = now

    db.commit()

    return len(orders)
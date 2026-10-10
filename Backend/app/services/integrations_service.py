"""
Read-only queries behind the /integrations GET endpoints (service role).
Nothing here writes, so no function commits.
"""
from __future__ import annotations

import base64
import binascii
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session

from app.models.order import Order, OrderStatus
from app.models.order_event import OrderEvent
from app.models.order_item import OrderItem
from app.models.outbox_event import OutboxEvent
from app.models.product import Product


def _bad_cursor() -> HTTPException:
    return HTTPException(status_code=422, detail="Invalid cursor")


def _order_timestamps_subquery():
    # orders has no timestamp columns: every create path writes an
    # ORDER_CREATED event, so the first event is creation, the last is the latest change.
    return (
        select(
            OrderEvent.order_id.label("order_id"),
            func.min(OrderEvent.created_at).label("created_at"),
            func.max(OrderEvent.created_at).label("updated_at"),
        )
        .group_by(OrderEvent.order_id)
        .subquery()
    )


def _order_summary(order: Order, created_at, updated_at) -> dict:
    return {
        "id": order.id,
        "reference": order.reference,
        "source_company": order.source_company,
        "status": order.status,
        "assigned_operator_id": order.assigned_operator_id,
        "created_at": created_at,
        "updated_at": updated_at,
    }


def list_orders_page(
    db: Session,
    limit: int,
    cursor: str | None = None,
    status: OrderStatus | None = None,
    updated_since: datetime | None = None,
) -> dict:
    """
    Newest first by id (ids grow with creation). The cursor is the last id
    of the previous page, so new orders never shift later pages.
    """
    ts = _order_timestamps_subquery()
    query = select(Order, ts.c.created_at, ts.c.updated_at).outerjoin(ts, ts.c.order_id == Order.id)

    if cursor is not None:
        try:
            last_id = int(cursor)
        except ValueError:
            raise _bad_cursor()
        query = query.where(Order.id < last_id)
    if status is not None:
        query = query.where(Order.status == status)
    if updated_since is not None:
        query = query.where(ts.c.updated_at >= updated_since)

    # One extra row tells us whether another page exists.
    rows = db.execute(query.order_by(Order.id.desc()).limit(limit + 1)).all()
    page = rows[:limit]

    return {
        "items": [_order_summary(order, created_at, updated_at) for order, created_at, updated_at in page],
        "next_cursor": str(page[-1][0].id) if len(rows) > limit else None,
    }


def get_order_detail(db: Session, order_id: int) -> dict:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    items = db.execute(
        select(OrderItem.product_id, Product.sku, OrderItem.qty)
        .outerjoin(Product, Product.id == OrderItem.product_id)
        .where(OrderItem.order_id == order_id)
        .order_by(OrderItem.id.asc())
    ).all()

    events = db.scalars(
        select(OrderEvent)
        .where(OrderEvent.order_id == order_id)
        .order_by(OrderEvent.created_at.asc(), OrderEvent.id.asc())
    ).all()

    created_at = events[0].created_at if events else None
    updated_at = events[-1].created_at if events else None

    return {
        **_order_summary(order, created_at, updated_at),
        "items": [{"product_id": pid, "sku": sku, "qty": qty} for pid, sku, qty in items],
        # actor_user_id is left out on purpose: role only, no person.
        "history": [
            {
                "from_status": e.from_status,
                "to_status": e.to_status,
                "action": e.action,
                "actor_role": e.actor_role,
                "time": e.created_at,
            }
            for e in events
        ],
    }


def _encode_event_cursor(row: OutboxEvent) -> str:
    raw = f"{row.occurred_at.isoformat()}|{row.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_event_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        occurred_at, row_id = raw.split("|", 1)
        return datetime.fromisoformat(occurred_at), uuid.UUID(row_id)
    except (binascii.Error, UnicodeDecodeError, ValueError):
        raise _bad_cursor()


def list_outbox_events_page(
    db: Session,
    limit: int,
    cursor: str | None = None,
    since: datetime | None = None,
    published: bool | None = None,
) -> dict:
    """
    Oldest first by (occurred_at, id), so a poller can resume from its last
    cursor. The id breaks ties between rows written in the same instant.
    Payload is never returned, only the envelope fields.
    """
    query = select(OutboxEvent)

    if cursor is not None:
        last_at, last_id = _decode_event_cursor(cursor)
        query = query.where(tuple_(OutboxEvent.occurred_at, OutboxEvent.id) > tuple_(last_at, last_id))
    if since is not None:
        query = query.where(OutboxEvent.occurred_at >= since)
    if published is not None:
        query = query.where(OutboxEvent.published.is_(published))

    rows = db.scalars(
        query.order_by(OutboxEvent.occurred_at.asc(), OutboxEvent.id.asc()).limit(limit + 1)
    ).all()
    page = rows[:limit]

    return {
        "items": [
            {
                "event_id": row.id,
                "event_type": row.event_type,
                "order_id": row.order_id,
                "occurred_at": row.occurred_at,
                "published": row.published,
                "published_at": row.published_at,
            }
            for row in page
        ],
        "next_cursor": _encode_event_cursor(page[-1]) if len(rows) > limit else None,
    }


def list_products(db: Session) -> list[Product]:
    return db.scalars(select(Product).order_by(Product.id.asc())).all()

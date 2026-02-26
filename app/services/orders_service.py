from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi import HTTPException

from app.models.order_item import OrderItem
from app.models.product import Product
from app.models.order import Order, OrderStatus
from app.models.order_event import OrderEvent


def reserve_stock_for_order(db: Session, order_id: int) -> None:
    """
    Lock products rows (FOR UPDATE), validate stock, decrement stock_qty.
    Caller owns the transaction + commit/rollback.
    """
    items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
    if not items:
        raise HTTPException(status_code=400, detail="Order has no items")

    product_ids = sorted({it.product_id for it in items})

    # LOCK products to avoid race conditions
    products = (
        db.execute(select(Product).where(Product.id.in_(product_ids)).with_for_update())
        .scalars()
        .all()
    )
    products_map = {p.id: p for p in products}

    # Validate: products exist + sufficient stock
    for it in items:
        p = products_map.get(it.product_id)
        if not p:
            raise HTTPException(status_code=400, detail=f"Product {it.product_id} not found")
        if p.stock_qty < it.qty:
            raise HTTPException(
                status_code=409,
                detail=f"Insufficient stock for product {p.id}: have {p.stock_qty}, need {it.qty}",
            )

    # Decrement stock (persisted on commit)
    for it in items:
        products_map[it.product_id].stock_qty -= it.qty


def restock_for_order(db: Session, order_id: int) -> None:
    """
    Lock products rows (FOR UPDATE), increment stock_qty based on order items.
    Caller owns the transaction + commit/rollback.
    """
    items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
    if not items:
        return

    product_ids = sorted({it.product_id for it in items})

    products = (
        db.execute(select(Product).where(Product.id.in_(product_ids)).with_for_update())
        .scalars()
        .all()
    )
    products_map = {p.id: p for p in products}

    for it in items:
        p = products_map.get(it.product_id)
        if not p:
            raise HTTPException(status_code=400, detail=f"Product {it.product_id} not found")
        p.stock_qty += it.qty


def get_order(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def transition(
    db: Session,
    order: Order,
    to_status: OrderStatus,
    actor=None,
    request_id: str | None = None,
) -> None:
    """
    Validates status machine transitions, updates order.status,
    and writes an OrderEvent audit row (same transaction).
    """
    allowed = {
        OrderStatus.NEW: {OrderStatus.RESERVED, OrderStatus.CANCELLED, OrderStatus.FAILED_RESERVATION},
        OrderStatus.RESERVED: {OrderStatus.PICKING, OrderStatus.CANCELLED},
        OrderStatus.PICKING: {OrderStatus.PICKED},
        OrderStatus.PICKED: {OrderStatus.SHIPPED},
        OrderStatus.SHIPPED: set(),
        OrderStatus.CANCELLED: set(),
        OrderStatus.FAILED_RESERVATION: {OrderStatus.RESERVED, OrderStatus.CANCELLED},
    }

    if to_status not in allowed[order.status]:
        raise HTTPException(
            status_code=409,
            detail=f"Invalid transition {order.status} -> {to_status}",
        )

    old = order.status
    order.status = to_status

    db.add(
        OrderEvent(
            order_id=order.id,
            action="STATUS_CHANGE",
            from_status=str(old),
            to_status=str(to_status),
            actor_user_id=getattr(actor, "id", None),
            actor_role=getattr(actor, "role", None),
            request_id=request_id,
        )
    )
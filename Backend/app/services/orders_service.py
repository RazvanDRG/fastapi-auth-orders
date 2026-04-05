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
    
    
def reserve_order_flow(db: Session, order_id: int, actor=None, request_id: str | None = None):
    order = get_order(db, order_id)

    if order.status == OrderStatus.RESERVED:
        return order

    if order.status == OrderStatus.FAILED_RESERVATION:
        raise HTTPException(status_code=409, detail="Order previously failed reservation")

    try:
        reserve_stock_for_order(db, order_id)
        transition(db, order, OrderStatus.RESERVED, actor=actor, request_id=request_id)
        db.commit()
        db.refresh(order)
        return order

    except HTTPException as e:
        db.rollback()

        if e.status_code == 409:
            order = get_order(db, order_id)
            transition(db, order, OrderStatus.FAILED_RESERVATION, actor=actor, request_id=request_id)
            db.commit()
            db.refresh(order)

        raise

    except Exception:
        db.rollback()
        raise


def retry_reserve_order_flow(db: Session, order_id: int, actor=None, request_id: str | None = None):
    order = get_order(db, order_id)

    if order.status == OrderStatus.RESERVED:
        return order

    if order.status != OrderStatus.FAILED_RESERVATION:
        raise HTTPException(
            status_code=409,
            detail=f"Retry reserve allowed only for FAILED_RESERVATION. Current: {order.status}",
        )

    try:
        reserve_stock_for_order(db, order_id)
        transition(db, order, OrderStatus.RESERVED, actor=actor, request_id=request_id)
        db.commit()
        db.refresh(order)
        return order

    except HTTPException as e:
        db.rollback()

        if e.status_code == 409:
            order = get_order(db, order_id)
            transition(db, order, OrderStatus.FAILED_RESERVATION, actor=actor, request_id=request_id)
            db.commit()
            db.refresh(order)

        raise

    except Exception:
        db.rollback()
        raise


def start_pick_flow(db: Session, order_id: int, actor=None, request_id: str | None = None):
    order = get_order(db, order_id)

    if order.status == OrderStatus.PICKING:
        return order

    if order.status != OrderStatus.RESERVED:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot start picking from {order.status}. Expected {OrderStatus.RESERVED}.",
        )

    transition(db, order, OrderStatus.PICKING, actor=actor, request_id=request_id)
    db.commit()
    db.refresh(order)
    return order


def confirm_pick_flow(db: Session, order_id: int, actor=None, request_id: str | None = None):
    order = get_order(db, order_id)

    if order.status == OrderStatus.PICKED:
        return order

    if order.status != OrderStatus.PICKING:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot confirm pick from {order.status}. Expected {OrderStatus.PICKING}.",
        )

    transition(db, order, OrderStatus.PICKED, actor=actor, request_id=request_id)
    db.commit()
    db.refresh(order)
    return order


def ship_order_flow(db: Session, order_id: int, actor=None, request_id: str | None = None):
    order = get_order(db, order_id)

    if order.status == OrderStatus.SHIPPED:
        return order

    if order.status != OrderStatus.PICKED:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot ship from {order.status}. Expected {OrderStatus.PICKED}.",
        )

    transition(db, order, OrderStatus.SHIPPED, actor=actor, request_id=request_id)
    db.commit()
    db.refresh(order)
    return order


def cancel_order_flow(db: Session, order_id: int, actor=None, request_id: str | None = None):
    order = get_order(db, order_id)

    if order.status == OrderStatus.CANCELLED:
        return order

    if order.status == OrderStatus.SHIPPED:
        raise HTTPException(status_code=409, detail="Cannot cancel a shipped order")

    try:
        if order.status in (OrderStatus.RESERVED, OrderStatus.PICKING, OrderStatus.PICKED):
            restock_for_order(db, order_id)

        transition(db, order, OrderStatus.CANCELLED, actor=actor, request_id=request_id)
        db.commit()
        db.refresh(order)
        return order

    except Exception:
        db.rollback()
        raise
    
def integration_reserve_flow(db: Session, order_id: int):
    order = get_order(db, order_id)

    if order.status == OrderStatus.RESERVED:
        return {"status": "RESERVED"}

    try:
        reserve_stock_for_order(db, order_id)
        transition(db, order, OrderStatus.RESERVED, actor=None, request_id=None)
        db.commit()
        return {"status": "RESERVED"}
    except Exception:
        db.rollback()
        raise


def integration_release_flow(db: Session, order_id: int):
    order = get_order(db, order_id)

    if order.status == OrderStatus.CANCELLED:
        return {"status": "CANCELLED"}

    if order.status not in (
        OrderStatus.RESERVED,
        OrderStatus.PICKING,
        OrderStatus.PICKED,
        OrderStatus.FAILED_RESERVATION,
    ):
        raise HTTPException(status_code=409, detail=f"Cannot release from {order.status}")

    try:
        if order.status in (OrderStatus.RESERVED, OrderStatus.PICKING, OrderStatus.PICKED):
            restock_for_order(db, order_id)

        transition(db, order, OrderStatus.CANCELLED, actor=None, request_id=None)
        db.commit()
        return {"status": "CANCELLED"}
    except Exception:
        db.rollback()
        raise
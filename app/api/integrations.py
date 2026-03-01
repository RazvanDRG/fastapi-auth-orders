from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.rbac import require_roles
from app.db.session import get_db
from app.services.orders_service import get_order, reserve_stock_for_order, restock_for_order, transition
from app.models.order import OrderStatus

router = APIRouter(
    prefix="/integrations",
    tags=["Integrations"],
    dependencies=[Depends(require_roles("service"))],
)

@router.post("/orders/{order_id}/reserve")
def integration_reserve(order_id: int, db: Session = Depends(get_db)):
    order = get_order(db, order_id)
    if order.status == OrderStatus.RESERVED:
        return {"status": "RESERVED"}  # idempotent

    reserve_stock_for_order(db, order_id)
    transition(db, order, OrderStatus.RESERVED, actor=None, request_id=None)
    db.commit()
    return {"status": "RESERVED"}

@router.post("/orders/{order_id}/release")
def integration_release(order_id: int, db: Session = Depends(get_db)):
    order = get_order(db, order_id)
    if order.status == OrderStatus.CANCELLED:
        return {"status": "CANCELLED"}  # idempotent

    # Only release if previously reserved-ish
    if order.status not in (OrderStatus.RESERVED, OrderStatus.PICKING, OrderStatus.PICKED, OrderStatus.FAILED_RESERVATION):
        raise HTTPException(status_code=409, detail=f"Cannot release from {order.status}")

    if order.status in (OrderStatus.RESERVED, OrderStatus.PICKING, OrderStatus.PICKED):
        restock_for_order(db, order_id)

    transition(db, order, OrderStatus.CANCELLED, actor=None, request_id=None)
    db.commit()
    return {"status": "CANCELLED"}
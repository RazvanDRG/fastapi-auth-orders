from fastapi import APIRouter, Depends
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.orders import OrderCreate, OrderOut
from app.models.order import Order, OrderStatus
from app.services.orders_service import get_order, transition
from app.db.session import get_db
from app.models.order_item import OrderItem
from app.services.orders_service import get_order, transition, reserve_stock_for_order
from app.services.orders_service import restock_for_order
from fastapi import APIRouter, Depends, Body

router = APIRouter(prefix="/orders", tags=["Orders"])

@router.post("", response_model=OrderOut, summary="Create order")
def create_order(
    payload: OrderCreate = Body(
        ...,
        example={
            "customer_id": 1,
            "reference": "NL-ORDER-001",
            "items": [
                {"product_id": 1, "qty": 2},
                {"product_id": 2, "qty": 1}
            ],
        },
    ),
    db: Session = Depends(get_db),
):
    order = Order(customer_id=payload.customer_id, reference=payload.reference, status=OrderStatus.NEW)
    db.add(order)
    db.flush()

    for it in payload.items:
        db.add(OrderItem(order_id=order.id, product_id=it.product_id, qty=it.qty))

    db.commit()
    db.refresh(order)
    return order

@router.get("/{order_id}", response_model=OrderOut, summary="Get order")
def read_order(order_id: int, db: Session = Depends(get_db)):
    return get_order(db, order_id)

@router.post("/{order_id}/reserve", response_model=OrderOut, summary="Reserve stock")
def reserve(order_id: int, db: Session = Depends(get_db)):
    order = get_order(db, order_id)

    # 🔒 IDMPOTENCY GUARD
    if order.status == OrderStatus.RESERVED:
        return order

    if order.status == OrderStatus.FAILED_RESERVATION:
        raise HTTPException(
            status_code=409,
            detail="Order previously failed reservation"
        )

    try:
        reserve_stock_for_order(db, order_id)
        transition(order, OrderStatus.RESERVED)
        db.commit()
        db.refresh(order)
        return order

    except HTTPException as e:
        db.rollback()

        if e.status_code == 409:
            order = get_order(db, order_id)
            order.status = OrderStatus.FAILED_RESERVATION
            db.commit()
            db.refresh(order)

        raise

    except Exception:
        db.rollback()
        raise
    

@router.post("/{order_id}/start-pick", response_model=OrderOut, summary="Start picking")
def start_pick(order_id: int, db: Session = Depends(get_db)):
    order = get_order(db, order_id)

    if order.status == OrderStatus.PICKING:
        return order
    if order.status in (OrderStatus.PICKED, OrderStatus.SHIPPED):
        return order  # deja trecut de picking

    transition(order, OrderStatus.PICKING)
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/confirm-pick", response_model=OrderOut, summary="Confirm picked")
def confirm_pick(order_id: int, db: Session = Depends(get_db)):
    order = get_order(db, order_id)

    if order.status == OrderStatus.PICKED:
        return order
    if order.status == OrderStatus.SHIPPED:
        return order

    transition(order, OrderStatus.PICKED)
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/ship", response_model=OrderOut, summary="Ship order")
def ship(order_id: int, db: Session = Depends(get_db)):
    order = get_order(db, order_id)

    if order.status == OrderStatus.SHIPPED:
        return order

    transition(order, OrderStatus.SHIPPED)
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/cancel", response_model=OrderOut, summary="Cancel order")
def cancel(order_id: int, db: Session = Depends(get_db)):
    order = get_order(db, order_id)

    # idempotent
    if order.status == OrderStatus.CANCELLED:
        return order

    # nu anulezi dacă a plecat (policy)
    if order.status == OrderStatus.SHIPPED:
        raise HTTPException(status_code=409, detail="Cannot cancel a shipped order")

    try:
        # restock doar dacă am scăzut stoc înainte
        if order.status in (OrderStatus.RESERVED, OrderStatus.PICKING, OrderStatus.PICKED):
            restock_for_order(db, order_id)

        transition(order, OrderStatus.CANCELLED)
        db.commit()
        db.refresh(order)
        return order

    except Exception:
        db.rollback()
        raise
    

@router.post("/{order_id}/retry-reserve", response_model=OrderOut, summary="Retry reserve stock")
def retry_reserve(order_id: int, db: Session = Depends(get_db)):
    order = get_order(db, order_id)

    # allowed only from FAILED_RESERVATION
    if order.status == OrderStatus.RESERVED:
        return order

    if order.status != OrderStatus.FAILED_RESERVATION:
        raise HTTPException(
            status_code=409,
            detail=f"Retry reserve allowed only for FAILED_RESERVATION. Current: {order.status}"
        )

    try:
        reserve_stock_for_order(db, order_id)
        transition(order, OrderStatus.RESERVED)
        db.commit()
        db.refresh(order)
        return order

    except HTTPException as e:
        db.rollback()

        # keep FAILED_RESERVATION if still no stock
        if e.status_code == 409:
            order = get_order(db, order_id)
            order.status = OrderStatus.FAILED_RESERVATION
            db.commit()
            db.refresh(order)

        raise

    except Exception:
        db.rollback()
        raise
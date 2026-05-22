from fastapi import APIRouter, Depends, Body, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import require_roles
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.order import Order, OrderStatus
from app.models.order_event import OrderEvent
from app.models.order_item import OrderItem
from app.models.product import Product
from app.models.user import User
from app.schemas.orders import OrderCreate, OrderOut, OrderEventOut
from app.core.roles import Roles
from app.services.orders_service import (
    get_order,
    reserve_order_flow,
    retry_reserve_order_flow,
    start_pick_flow,
    confirm_pick_flow,
    ship_order_flow,
    cancel_order_flow,
)
from app.services.event_bus import publish

router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
    dependencies=[Depends(require_roles(Roles.ADMIN, Roles.OPERATOR))],
)


def _request_id(request: Request) -> str | None:
    rid = getattr(request.state, "request_id", None)
    return rid or request.headers.get("X-Request-ID")

def _publish_order(order) -> None:
    publish({
        "type": "order_update",
        "order_id": order.id,
        "reference": order.reference,
        "status": str(order.status),
    })

@router.post("", response_model=OrderOut, summary="Create order")
def create_order(
    request: Request,
    payload: OrderCreate = Body(
        ...,
        examples={
            "customer_id": 1,
            "reference": "NL-ORDER-001",
            "items": [
                {"product_id": 1, "qty": 2},
                {"product_id": 2, "qty": 1},
            ],
        },
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = Order(
        customer_id=current_user.id,
        reference=payload.reference,
        status=OrderStatus.NEW,
    )

    db.add(order)
    db.flush()

    for it in payload.items:
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=it.product_id,
                qty=it.qty,
            )
        )

    db.add(
        OrderEvent(
            order_id=order.id,
            action="ORDER_CREATED",
            from_status=None,
            to_status=str(OrderStatus.NEW),
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            request_id=_request_id(request),
        )
    )

    db.commit()
    db.refresh(order)
    _publish_order(order)
    return order


@router.get("/products", summary="List products")
def list_products(db: Session = Depends(get_db)):
    products = db.execute(select(Product)).scalars().all()
    return products


@router.get("/my", response_model=list[OrderOut], summary="My orders")
def my_orders(
    archived: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(Order)
        .filter(Order.customer_id == current_user.id)
    )

    if archived:
        query = query.filter(Order.archived_at.isnot(None))
    else:
        query = query.filter(Order.archived_at.is_(None))

    orders = (
        query
        .order_by(Order.id.desc())
        .all()
    )

    for order in orders:
        last_event = (
            db.query(OrderEvent)
            .filter(OrderEvent.order_id == order.id)
            .order_by(OrderEvent.created_at.desc())
            .first()
        )

        order.last_activity_at = (
            last_event.created_at if last_event else None
        )
        items = (
            db.query(OrderItem)
            .filter(OrderItem.order_id == order.id)
            .all()
        )

        for item in items:
            product = (
                db.query(Product)
                .filter(Product.id == item.product_id)
                .first()
            )

            item.product_name = product.name if product else None

        order.items = items

    result = []

    for order in orders:
        result.append(
            OrderOut(
                id=order.id,
                customer_id=order.customer_id,
                reference=order.reference,
                status=order.status,
                items=order.items,
                last_activity_at=order.last_activity_at,
            )
        )

    return result


@router.get("/{order_id}", response_model=OrderOut, summary="Get order")
def read_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_order(db, order_id)


@router.get(
    "/{order_id}/events",
    response_model=list[OrderEventOut],
    summary="Get order events",
)
def get_order_events(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(OrderEvent)
        .filter(OrderEvent.order_id == order_id)
        .order_by(OrderEvent.created_at.desc())
        .all()
    )


@router.post("/{order_id}/reserve", response_model=OrderOut, summary="Reserve stock")
def reserve(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = reserve_order_flow(
        db=db,
        order_id=order_id,
        actor=current_user,
        request_id=_request_id(request),
    )
    _publish_order(order)
    return order


@router.post("/{order_id}/start-pick", response_model=OrderOut, summary="Start picking")
def start_pick(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = start_pick_flow(
        db=db,
        order_id=order_id,
        actor=current_user,
        request_id=_request_id(request),
    )
    _publish_order(order)
    return order


@router.post("/{order_id}/confirm-pick", response_model=OrderOut, summary="Confirm picked")
def confirm_pick(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = confirm_pick_flow(
        db=db,
        order_id=order_id,
        actor=current_user,
        request_id=_request_id(request),
    )
    _publish_order(order)
    return order


@router.post("/{order_id}/ship", response_model=OrderOut, summary="Ship order")
def ship(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = ship_order_flow(
        db=db,
        order_id=order_id,
        actor=current_user,
        request_id=_request_id(request),
    )
    _publish_order(order)
    return order


@router.post("/{order_id}/cancel", response_model=OrderOut, summary="Cancel order")
def cancel(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = cancel_order_flow(
        db=db,
        order_id=order_id,
        actor=current_user,
        request_id=_request_id(request),
    )
    _publish_order(order)
    return order

@router.post(
    "/{order_id}/retry-reserve",
    response_model=OrderOut,
    summary="Retry reserve stock",
)
def retry_reserve(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = retry_reserve_order_flow(
        db=db,
        order_id=order_id,
        actor=current_user,
        request_id=_request_id(request),
    )
    _publish_order(order)
    return order
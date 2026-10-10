from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.rate_limit import limit_create_order
from app.core.rbac import require_roles
from app.core.roles import Roles
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.order import OrderStatus
from app.models.user import User
from app.schemas.integrations import (
    IntegrationOrderDetailOut,
    IntegrationOrderPage,
    IntegrationOutboxEventPage,
    IntegrationProductOut,
)
from app.schemas.orders import ServiceOrderCreate, OrderOut
from app.services import integrations_service
from app.services.orders_service import (
    integration_reserve_flow,
    integration_release_flow,
    create_service_order,
)
from app.services.event_bus import publish

router = APIRouter(
    prefix="/integrations",
    tags=["Integrations"],
    dependencies=[Depends(require_roles(Roles.SERVICE))],
)


def _request_id(request: Request) -> str | None:
    rid = getattr(request.state, "request_id", None)
    return rid or request.headers.get("X-Request-ID")


def _publish_order_update(order_id: int, status: str) -> None:
    publish({
        "type": "order_update",
        "order_id": order_id,
        "status": status,
    })


@router.post(
    "/orders",
    response_model=OrderOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limit_create_order)],
    summary="Create order (service-to-service)",
    responses={200: {"model": OrderOut, "description": "Retry: order with this source_company and reference already exists"}},
)
def integration_create_order(
    payload: ServiceOrderCreate,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order, created = create_service_order(db, payload, current_user, request_id=_request_id(request))
    if created:
        _publish_order_update(order.id, str(order.status))
    else:
        response.status_code = status.HTTP_200_OK
    return order


@router.post("/orders/{order_id}/reserve")
def integration_reserve(order_id: int, request: Request, db: Session = Depends(get_db)):
    result = integration_reserve_flow(db, order_id, request_id=_request_id(request))
    _publish_order_update(order_id, result["status"])
    return result


@router.post("/orders/{order_id}/release")
def integration_release(order_id: int, request: Request, db: Session = Depends(get_db)):
    result = integration_release_flow(db, order_id, request_id=_request_id(request))
    _publish_order_update(order_id, result["status"])
    return result


# --- Read-only endpoints (service role) ---

@router.get("/orders", response_model=IntegrationOrderPage, summary="List orders (newest first)")
def integration_list_orders(
    # Named status_filter: "status" is already the fastapi status module here.
    status_filter: OrderStatus | None = Query(None, alias="status"),
    updated_since: datetime | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return integrations_service.list_orders_page(
        db, limit=limit, cursor=cursor, status=status_filter, updated_since=updated_since,
    )


@router.get("/orders/{order_id}", response_model=IntegrationOrderDetailOut, summary="Order with items and status history")
def integration_get_order(order_id: int, db: Session = Depends(get_db)):
    return integrations_service.get_order_detail(db, order_id)


@router.get("/events", response_model=IntegrationOutboxEventPage, summary="List outbox events (oldest first)")
def integration_list_events(
    since: datetime | None = Query(None),
    published: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return integrations_service.list_outbox_events_page(
        db, limit=limit, cursor=cursor, since=since, published=published,
    )


@router.get("/products", response_model=list[IntegrationProductOut], summary="List products")
def integration_list_products(db: Session = Depends(get_db)):
    return integrations_service.list_products(db)

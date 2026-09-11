from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.rbac import require_roles
from app.core.roles import Roles
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.orders import ServiceOrderCreate, OrderOut
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


@router.post("/orders", response_model=OrderOut, summary="Create order (service-to-service)")
def integration_create_order(
    payload: ServiceOrderCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = create_service_order(db, payload, current_user, request_id=_request_id(request))
    _publish_order_update(order.id, str(order.status))
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
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.rbac import require_roles
from app.core.roles import Roles
from app.db.session import get_db
from app.services.orders_service import integration_reserve_flow, integration_release_flow

router = APIRouter(
    prefix="/integrations",
    tags=["Integrations"],
    dependencies=[Depends(require_roles(Roles.SERVICE))],
)


@router.post("/orders/{order_id}/reserve")
def integration_reserve(order_id: int, db: Session = Depends(get_db)):
    return integration_reserve_flow(db, order_id)


@router.post("/orders/{order_id}/release")
def integration_release(order_id: int, db: Session = Depends(get_db)):
    return integration_release_flow(db, order_id)
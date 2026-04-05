from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.rbac import require_roles
from app.core.roles import Roles
from app.services.users_service import soft_delete_user, update_user_role

router = APIRouter(
    prefix="/users",
    tags=["Users"],
    dependencies=[Depends(require_roles(Roles.ADMIN))],
)


class UpdateUserRoleRequest(BaseModel):
    role: Literal["admin", "operator", "service"]


@router.delete("/{user_id}", summary="Soft delete user")
def delete_user_route(user_id: int, db: Session = Depends(get_db)):
    return soft_delete_user(db, user_id)


@router.patch("/{user_id}/role", summary="Update user role")
def update_user_role_route(
    user_id: int,
    payload: UpdateUserRoleRequest,
    db: Session = Depends(get_db),
):
    return update_user_role(db, user_id, payload.role)
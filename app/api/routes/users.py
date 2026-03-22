from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.core.rbac import require_roles
from app.core.roles import Roles

router = APIRouter(
    prefix="/users",
    tags=["Users"],
    dependencies=[Depends(require_roles(Roles.ADMIN))],
)


class UpdateUserRoleRequest(BaseModel):
    role: Literal["admin", "operator", "service"]


@router.delete("/{user_id}", summary="Soft delete user")
def soft_delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_deleted:
        return {"message": "User already deleted"}

    # Do not allow deleting the last active admin
    if user.role == Roles.ADMIN and not user.is_deleted:
        active_admins = (
            db.query(User)
            .filter(User.role == Roles.ADMIN, User.is_deleted == False)
            .count()
        )

        if active_admins <= 1:
            raise HTTPException(
                status_code=409,
                detail="Cannot delete the last active admin",
            )

    user.is_deleted = True
    user.deleted_at = datetime.utcnow()

    db.commit()

    return {"message": "User soft deleted"}


@router.patch("/{user_id}/role", summary="Update user role")
def update_user_role(
    user_id: int,
    payload: UpdateUserRoleRequest,
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_deleted:
        raise HTTPException(status_code=409, detail="Cannot change role of a deleted user")

    # idempotent: same role -> no-op
    if user.role == payload.role:
        return {
            "message": "Role unchanged",
            "user_id": user.id,
            "email": user.email,
            "role": user.role,
        }

    # Protect last active admin from demotion
    if user.role == Roles.ADMIN and payload.role != Roles.ADMIN:
        active_admins = (
            db.query(User)
            .filter(User.role == Roles.ADMIN, User.is_deleted == False)
            .count()
        )

        if active_admins <= 1:
            raise HTTPException(
                status_code=409,
                detail="Cannot demote the last active admin",
            )

    user.role = payload.role
    db.commit()
    db.refresh(user)

    return {
        "message": "User role updated",
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
    }
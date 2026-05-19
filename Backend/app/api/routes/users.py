from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import require_roles
from app.core.roles import Roles
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.users_service import soft_delete_user, update_user_role

router = APIRouter(
    prefix="/users",
    tags=["Users"],
    dependencies=[Depends(require_roles(Roles.ADMIN))],
)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: Literal["admin", "operator", "service"]
    first_name: str | None = None
    last_name: str | None = None
    is_deleted: bool

    class Config:
        from_attributes = True


class UpdateUserRoleRequest(BaseModel):
    role: Literal["admin", "operator", "service"]


class UpdateUserProfileRequest(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


@router.get("", response_model=list[UserOut], summary="List users")
def list_users(
    db: Session = Depends(get_db),
):
    return (
        db.execute(
            select(User)
            .order_by(User.id.asc())
        )
        .scalars()
        .all()
    )


@router.patch("/{user_id}/profile", response_model=UserOut, summary="Update user profile")
def update_user_profile_route(
    user_id: int,
    payload: UpdateUserProfileRequest,
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_deleted:
        raise HTTPException(status_code=409, detail="Cannot update a deleted user")

    existing = db.scalar(
        select(User).where(
            User.email == payload.email,
            User.id != user_id,
        )
    )

    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")

    user.email = payload.email.strip().lower()
    user.first_name = payload.first_name.strip()
    user.last_name = payload.last_name.strip()

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.delete("/{user_id}", summary="Soft delete user")
def delete_user_route(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return soft_delete_user(db, user_id, actor=current_user)


@router.patch("/{user_id}/role", summary="Update user role")
def update_user_role_route(
    user_id: int,
    payload: UpdateUserRoleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_user_role(db, user_id, payload.role, actor=current_user)
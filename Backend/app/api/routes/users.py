from typing import Literal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import require_roles
from app.core.roles import Roles
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.user_admin_event import UserAdminEvent
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

class DeletedUserOut(BaseModel):
    id: int
    email: EmailStr
    role: Literal["admin", "operator", "service"]
    first_name: str | None = None
    last_name: str | None = None
    deleted_at: datetime | None = None
    self_deleted: bool = False

    class Config:
        from_attributes = True

class UpdateUserRoleRequest(BaseModel):
    role: Literal["admin", "operator", "service"]


class UpdateUserProfileRequest(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


@router.get(
    "/deleted",
    response_model=list[DeletedUserOut],
    summary="List soft-deleted users (audit)",
)
def list_deleted_users(
    db: Session = Depends(get_db),
):
    """
    Returnează userii cu cont șters, sortați după data ștergerii (recent → vechi).
    Marchează self_deleted=True pentru cei care și-au șters singuri contul.
    """
    users = (
        db.execute(
            select(User)
            .where(User.is_deleted == True)  # noqa: E712
            .order_by(User.deleted_at.desc().nullslast(), User.id.desc())
        )
        .scalars()
        .all()
    )

    if not users:
        return []

    user_ids = [u.id for u in users]

    # Set cu id-urile celor care au cel puțin un eveniment USER_SELF_DELETED
    self_delete_user_ids = set(
        db.execute(
            select(UserAdminEvent.user_id).where(
                UserAdminEvent.user_id.in_(user_ids),
                UserAdminEvent.action == "USER_SELF_DELETED",
            )
        )
        .scalars()
        .all()
    )

    return [
        DeletedUserOut(
            id=u.id,
            email=u.email,
            role=u.role,
            first_name=u.first_name,
            last_name=u.last_name,
            deleted_at=u.deleted_at,
            self_deleted=u.id in self_delete_user_ids,
        )
        for u in users
    ]


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
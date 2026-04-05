from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.roles import Roles
from app.models.user import User


def soft_delete_user(db: Session, user_id: int) -> dict:
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


def update_user_role(db: Session, user_id: int, new_role: str) -> dict:
    user = db.get(User, user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_deleted:
        raise HTTPException(status_code=409, detail="Cannot change role of a deleted user")

    # idempotent: same role -> no-op
    if user.role == new_role:
        return {
            "message": "Role unchanged",
            "user_id": user.id,
            "email": user.email,
            "role": user.role,
        }

    # Protect last active admin from demotion
    if user.role == Roles.ADMIN and new_role != Roles.ADMIN:
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

    user.role = new_role
    db.commit()
    db.refresh(user)

    return {
        "message": "User role updated",
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
    }
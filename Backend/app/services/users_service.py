import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.roles import Roles
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.user_admin_event import UserAdminEvent
from app.services.auth import verify_password
from app.services.email import send_account_deleted_email
from app.services.event_bus import publish

logger = logging.getLogger("app")


def soft_delete_user(db: Session, user_id: int, actor: User | None = None) -> dict:
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

    db.add(
        UserAdminEvent(
            user_id=user.id,
            actor_user_id=getattr(actor, "id", None),
            action="USER_SOFT_DELETED",
            old_role=user.role,
            new_role=None,
        )
    )

    user.is_deleted = True
    user.deleted_at = datetime.utcnow()

    db.commit()

    publish({
        "type": "user_deleted",
        "user_id": user.id,
        "self_deleted": False,
    })

    return {"message": "User soft deleted"}


def update_user_role(db: Session, user_id: int, new_role: str, actor: User | None = None) -> dict:
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

    old_role = user.role
    user.role = new_role

    db.add(
        UserAdminEvent(
            user_id=user.id,
            actor_user_id=getattr(actor, "id", None),
            action="ROLE_CHANGED",
            old_role=old_role,
            new_role=new_role,
        )
    )

    db.commit()
    db.refresh(user)

    return {
        "message": "User role updated",
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
    }

def self_delete_account(db: Session, user: User, password: str) -> dict:

    now = datetime.now(timezone.utc)

    # 1) Verificare lock activ (chiar înainte de a verifica parola)
    if user.delete_locked_until and user.delete_locked_until > now:
        seconds_left = int((user.delete_locked_until - now).total_seconds())
        minutes_left = max(1, seconds_left // 60)
        raise HTTPException(
            status_code=429,
            detail=(
                f"Too many failed attempts. Try again in {minutes_left} "
                f"minute(s)."
            ),
        )

    # 2) Verificare parolă
    if not verify_password(password, user.hashed_password):
        user.delete_failed_attempts = (user.delete_failed_attempts or 0) + 1

        # Dacă tocmai am atins pragul, activăm lock-ul
        if user.delete_failed_attempts >= settings.delete_account_max_attempts:
            user.delete_locked_until = now + timedelta(
                minutes=settings.delete_account_lock_minutes
            )
            user.delete_failed_attempts = 0  # resetăm counter-ul după lock

            db.commit()

            raise HTTPException(
                status_code=429,
                detail=(
                    f"Too many failed attempts. Account deletion locked "
                    f"for {settings.delete_account_lock_minutes} minutes."
                ),
            )

        attempts_left = (
            settings.delete_account_max_attempts - user.delete_failed_attempts
        )
        db.commit()

        raise HTTPException(
            status_code=401,
            detail=f"Incorrect password. {attempts_left} attempt(s) remaining.",
        )

    # 3) Parola corectă → resetăm counter-ul în caz că existau încercări
    user.delete_failed_attempts = 0
    user.delete_locked_until = None

    if user.is_deleted:
        db.commit()
        raise HTTPException(status_code=409, detail="Account is already deleted")

    # Nu permitem ultimului admin activ să-și șteargă propriul cont
    if user.role == Roles.ADMIN:
        active_admins = (
            db.query(User)
            .filter(User.role == Roles.ADMIN, User.is_deleted == False)  # noqa: E712
            .count()
        )

        if active_admins <= 1:
            raise HTTPException(
                status_code=409,
                detail="Cannot delete the last active admin account",
            )

    deleted_at = datetime.now(timezone.utc)

    user.is_deleted = True
    user.deleted_at = deleted_at

    db.add(
        UserAdminEvent(
            user_id=user.id,
            actor_user_id=user.id,
            action="USER_SELF_DELETED",
            old_role=user.role,
            new_role=None,
        )
    )

    # Revocă toate refresh token-urile active ale acestui user
    (
        db.query(RefreshToken)
        .filter(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
        .update({RefreshToken.revoked_at: deleted_at})
    )

    db.commit()

    # Capturăm valorile ÎNAINTE să închidem sesiunea / să folosim user-ul
    target_email = user.email
    display_name = (
        " ".join(filter(None, [user.first_name, user.last_name])).strip()
        or None
    )

    try:
        send_account_deleted_email(email=target_email, display_name=display_name)
    except Exception:
        logger.exception(
            "self_delete_email_failed",
            extra={"user_id": user.id, "email": target_email},
        )

    publish({
        "type": "user_deleted",
        "user_id": user.id,
        "self_deleted": True,
    })

    return {
        "message": "Account deleted",
        "deleted_at": deleted_at.isoformat() + "Z",
    }
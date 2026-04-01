import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from jose import jwt
import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.password_reset_code import PasswordResetCode
from app.models.user import User
from app.services.refresh_tokens import revoke_all_refresh_tokens_for_user


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(subject: str, role: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.jwt_exp_minutes)

    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": exp,
    }

    if role:
        payload["role"] = role

    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def generate_reset_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_reset_code(code: str) -> str:
    data = (code + settings.password_reset_code_salt).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def issue_password_reset_code(db: Session, user_id: int) -> str:
    now = datetime.now(timezone.utc)

    existing_active_codes = db.scalars(
        select(PasswordResetCode).where(
            PasswordResetCode.user_id == user_id,
            PasswordResetCode.used_at.is_(None),
            PasswordResetCode.expires_at > now,
        )
    ).all()

    for item in existing_active_codes:
        item.used_at = now

    raw_code = generate_reset_code()

    db.add(
        PasswordResetCode(
            user_id=user_id,
            code_hash=hash_reset_code(raw_code),
            created_at=now,
            expires_at=now + timedelta(minutes=settings.password_reset_code_ttl_minutes),
            attempt_count=0,
            max_attempts=settings.password_reset_max_attempts,
            used_at=None,
        )
    )

    return raw_code


def reset_password_with_code(
    db: Session,
    email: str,
    code: str,
    new_password: str,
    confirm_password: str,
) -> None:
    new_password = new_password.strip()
    confirm_password = confirm_password.strip()

    if new_password != confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    user = db.scalar(select(User).where(User.email == email))
    if not user or user.is_deleted:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    now = datetime.now(timezone.utc)

    reset_record = db.scalar(
        select(PasswordResetCode)
        .where(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.used_at.is_(None),
        )
        .order_by(PasswordResetCode.created_at.desc())
    )

    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    if reset_record.expires_at < now:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    if reset_record.attempt_count >= reset_record.max_attempts:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    if hash_reset_code(code) != reset_record.code_hash:
        reset_record.attempt_count += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    if verify_password(new_password, user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="New password must be different from the current password"
        )

    user.hashed_password = hash_password(new_password)
    reset_record.used_at = now

    revoke_all_refresh_tokens_for_user(db, user.id)

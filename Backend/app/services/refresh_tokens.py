import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.refresh_token import RefreshToken


def _hash_token(raw: str) -> str:
    data = (raw + settings.refresh_token_salt).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def issue_refresh_token(db: Session, user_id: int) -> str:
    raw = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw)

    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=settings.refresh_token_ttl_days)

    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            created_at=now,
            expires_at=expires,
            revoked_at=None,
        )
    )
    return raw


def rotate_refresh_token(db: Session, raw_token: str) -> int:
    token_hash = _hash_token(raw_token)
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))

    if not rt:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    now = datetime.now(timezone.utc)
    if rt.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Refresh token revoked")
    if rt.expires_at < now:
        raise HTTPException(status_code=401, detail="Refresh token expired")

    rt.revoked_at = now
    return rt.user_id


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    token_hash = _hash_token(raw_token)
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if rt and rt.revoked_at is None:
        rt.revoked_at = datetime.now(timezone.utc)

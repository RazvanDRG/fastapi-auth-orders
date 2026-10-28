import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
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
    now = datetime.now(timezone.utc)

    # One atomic UPDATE: of several concurrent refreshes with the same token,
    # only the first matches the row; the rest wait on its row lock, then see
    # revoked_at set and update 0 rows.
    user_id = db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at >= now,
        )
        .values(revoked_at=now)
        .returning(RefreshToken.user_id)
    ).scalar_one_or_none()

    if user_id is not None:
        return user_id

    # 0 rows: read only to pick the same message as before (D-001).
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if not rt:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if rt.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Refresh token revoked")
    raise HTTPException(status_code=401, detail="Refresh token expired")


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    token_hash = _hash_token(raw_token)
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if rt and rt.revoked_at is None:
        rt.revoked_at = datetime.now(timezone.utc)


def revoke_all_refresh_tokens_for_user(db: Session, user_id: int) -> None:
    now = datetime.now(timezone.utc)

    tokens = db.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
    ).all()

    for token in tokens:
        token.revoked_at = now
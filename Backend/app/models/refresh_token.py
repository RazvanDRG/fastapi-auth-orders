# app/models/refresh_token.py
from datetime import datetime
from sqlalchemy import Column, Integer, DateTime, ForeignKey, String, Index
from sqlalchemy.orm import relationship
from app.db.base import Base

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    token_hash = Column(String(64), nullable=False, unique=True, index=True)  # sha256 hex
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", backref="refresh_tokens")

Index("ix_refresh_tokens_user_active", RefreshToken.user_id, RefreshToken.revoked_at)
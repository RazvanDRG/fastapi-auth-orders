from datetime import datetime

from sqlalchemy import Column, Integer, DateTime, ForeignKey, String, Index
from sqlalchemy.orm import relationship

from app.db.base import Base


class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    code_hash = Column(String(64), nullable=False, index=True)  # sha256 hex
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=5)

    used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", backref="password_reset_codes")


Index(
    "ix_password_reset_codes_user_active",
    PasswordResetCode.user_id,
    PasswordResetCode.used_at,
    PasswordResetCode.expires_at,
)
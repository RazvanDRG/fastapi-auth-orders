import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base

class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type = Column(String(100), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)

    request_id = Column(String(64), nullable=True, index=True)
    payload = Column(Text, nullable=False)  # JSON-serialized event body

    occurred_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    published = Column(Boolean, nullable=False, default=False)
    published_at = Column(DateTime(timezone=True), nullable=True)

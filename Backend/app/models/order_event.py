from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.db.base import Base

class OrderEvent(Base):
    __tablename__ = "order_events"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)

    action = Column(String(50), nullable=False)      # ex: "STATUS_CHANGE"
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=True)

    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_role = Column(String(50), nullable=True)

    request_id = Column(String(64), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
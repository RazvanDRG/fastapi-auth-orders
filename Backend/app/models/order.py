import enum

from sqlalchemy import Column, DateTime, Enum, Integer, String

from app.db.base import Base


class OrderStatus(str, enum.Enum):
    NEW = "NEW"
    RESERVED = "RESERVED"
    PICKING = "PICKING"
    PICKED = "PICKED"
    SHIPPED = "SHIPPED"
    CANCELLED = "CANCELLED"
    FAILED_RESERVATION = "FAILED_RESERVATION"


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    status = Column(Enum(OrderStatus), nullable=False, default=OrderStatus.NEW)

    customer_id = Column(Integer, nullable=False)
    reference = Column(String(50), nullable=True)

    archive_due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    archived_at = Column(DateTime(timezone=True), nullable=True, index=True)
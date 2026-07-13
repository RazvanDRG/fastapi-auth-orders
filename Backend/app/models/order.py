import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String

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

    status = Column(
        Enum(OrderStatus),
        nullable=False,
        default=OrderStatus.NEW,
        index=True,
    )

    customer_id = Column(Integer, nullable=False, index=True)
    reference = Column(String(50), nullable=True)

    # Name of the external company that created this order via integration
    # (e.g. "System 2 - RetailCo"). Null for orders created manually in the UI.
    source_company = Column(String(100), nullable=True)

    # Operator who claimed this order for processing. Null means any operator
    # can still pick it up; once set, only this operator sees it in "my orders".
    assigned_operator_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    archive_due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    archived_at = Column(DateTime(timezone=True), nullable=True, index=True)
import enum
from sqlalchemy import Column, Integer, String, Enum
from app.db.base import Base


note = Column(String(255), nullable=True)

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
    


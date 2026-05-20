from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class InventoryEvent(Base):
    __tablename__ = "inventory_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"),
        nullable=False,
        index=True,
    )

    sku: Mapped[str] = mapped_column(String(50), nullable=False)

    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    old_stock: Mapped[int] = mapped_column(Integer, nullable=False)

    new_stock: Mapped[int] = mapped_column(Integer, nullable=False)

    delta: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
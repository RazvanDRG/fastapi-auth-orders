"""add orders indexes

Revision ID: 26994e2c5fab
Revises: 16ac9337ddef
Create Date: 2026-05-17 09:00:18.965128

"""
from typing import Sequence, Union

from alembic import op


revision: str = "26994e2c5fab"
down_revision: Union[str, Sequence[str], None] = "16ac9337ddef"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_orders_customer_id",
        "orders",
        ["customer_id"],
        unique=False,
    )

    op.create_index(
        "ix_orders_status",
        "orders",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_orders_status", table_name="orders")
    op.drop_index("ix_orders_customer_id", table_name="orders")
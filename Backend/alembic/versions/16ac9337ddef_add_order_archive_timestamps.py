"""add order archive timestamps

Revision ID: 16ac9337ddef
Revises: 93d59fbcd414
Create Date: 2026-05-16 19:30:42.079904

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '16ac9337ddef'
down_revision: Union[str, Sequence[str], None] = '93d59fbcd414'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("archive_due_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_orders_archive_due_at", "orders", ["archive_due_at"])
    op.create_index("ix_orders_archived_at", "orders", ["archived_at"])


def downgrade() -> None:
    op.drop_index("ix_orders_archived_at", table_name="orders")
    op.drop_index("ix_orders_archive_due_at", table_name="orders")
    op.drop_column("orders", "archived_at")
    op.drop_column("orders", "archive_due_at")
"""add order source company and assigned operator

Revision ID: a1b2c3d4e5f7
Revises: 6f8120f5499d
Create Date: 2026-07-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, Sequence[str], None] = '6f8120f5499d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        "orders",
        sa.Column("source_company", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("assigned_operator_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_orders_assigned_operator_id_users",
        "orders",
        "users",
        ["assigned_operator_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_orders_assigned_operator_id",
        "orders",
        ["assigned_operator_id"],
    )


def downgrade():
    op.drop_index("ix_orders_assigned_operator_id", table_name="orders")
    op.drop_constraint("fk_orders_assigned_operator_id_users", "orders", type_="foreignkey")
    op.drop_column("orders", "assigned_operator_id")
    op.drop_column("orders", "source_company")
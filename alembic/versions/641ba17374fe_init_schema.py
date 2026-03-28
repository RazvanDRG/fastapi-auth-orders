"""init schema

Revision ID: 641ba17374fe
Revises: 0c1201335860
Create Date: 2026-02-06 20:33:03.414386

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '641ba17374fe'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "status",
            sa.Enum(
                "NEW",
                "RESERVED",
                "PICKING",
                "PICKED",
                "SHIPPED",
                "CANCELLED",
                "FAILED_RESERVATION",
                name="orderstatus",
            ),
            nullable=False,
        ),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(50), nullable=True),
    )


def downgrade():
    op.drop_table("orders")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
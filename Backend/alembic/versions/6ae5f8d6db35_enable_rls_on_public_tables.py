"""enable_rls_on_public_tables

Revision ID: 6ae5f8d6db35
Revises: a1b2c3d4e5f7
Create Date: 2026-07-29 22:06:31.390157

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

TABLES = [
    "alembic_version",
    "order_items",
    "products",
    "refresh_tokens",
    "order_events",
    "users",
    "password_reset_codes",
    "user_admin_events",
    "inventory_events",
    "orders",
]


# revision identifiers, used by Alembic.
revision: str = '6ae5f8d6db35'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;")

def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY;")
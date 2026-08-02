"""add_service_role_policies_to_public_tables

Revision ID: 334a5d982c0d
Revises: 6ae5f8d6db35
Create Date: 2026-08-02 23:19:49.613366

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '334a5d982c0d'
down_revision: Union[str, Sequence[str], None] = '6ae5f8d6db35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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

def upgrade() -> None:
    policy_statements = "\n".join(
        f'CREATE POLICY "service_role_only" ON public.{table} '
        f'FOR ALL TO service_role USING (true) WITH CHECK (true);'
        for table in TABLES
    )
    op.execute(f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                {policy_statements}
            END IF;
        END $$;
    """)

def downgrade() -> None:
    policy_statements = "\n".join(
        f'DROP POLICY IF EXISTS "service_role_only" ON public.{table};'
        for table in TABLES
    )
    op.execute(f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                {policy_statements}
            END IF;
        END $$;
    """)
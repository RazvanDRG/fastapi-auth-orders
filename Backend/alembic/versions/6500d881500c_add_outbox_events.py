"""add outbox events

Revision ID: 6500d881500c
Revises: 311cbbcc6749
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '6500d881500c'
down_revision: Union[str, Sequence[str], None] = '311cbbcc6749'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "outbox_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_outbox_events_event_type", "outbox_events", ["event_type"])
    op.create_index("ix_outbox_events_order_id", "outbox_events", ["order_id"])
    op.create_index("ix_outbox_events_request_id", "outbox_events", ["request_id"])

    # RLS: new tables need this or the Supabase security advisor flags them
    # (same pattern as 6ae5f8d6db35 + 334a5d982c0d).
    op.execute("ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                CREATE POLICY "service_role_only" ON public.outbox_events
                FOR ALL TO service_role USING (true) WITH CHECK (true);
            END IF;
        END $$;
    """)

def downgrade():
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                DROP POLICY IF EXISTS "service_role_only" ON public.outbox_events;
            END IF;
        END $$;
    """)
    op.execute("ALTER TABLE public.outbox_events DISABLE ROW LEVEL SECURITY;")

    op.drop_index("ix_outbox_events_request_id", table_name="outbox_events")
    op.drop_index("ix_outbox_events_order_id", table_name="outbox_events")
    op.drop_index("ix_outbox_events_event_type", table_name="outbox_events")
    op.drop_table("outbox_events")

"""add user admin events

Revision ID: 93d59fbcd414
Revises: 91f0d2a4c111
Create Date: 2026-04-05 19:46:01.711165

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '93d59fbcd414'
down_revision: Union[str, Sequence[str], None] = '91f0d2a4c111'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_admin_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("old_role", sa.String(length=50), nullable=True),
        sa.Column("new_role", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(op.f("ix_user_admin_events_user_id"), "user_admin_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_admin_events_actor_user_id"), "user_admin_events", ["actor_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_admin_events_actor_user_id"), table_name="user_admin_events")
    op.drop_index(op.f("ix_user_admin_events_user_id"), table_name="user_admin_events")
    op.drop_table("user_admin_events")
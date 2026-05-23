"""add delete attempt tracking

Revision ID: 6f8120f5499d
Revises: 1bce1411f26a
Create Date: 2026-05-23 16:57:36.544080

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f8120f5499d'
down_revision: Union[str, Sequence[str], None] = '1bce1411f26a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "delete_failed_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "delete_locked_until",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("users", "delete_locked_until")
    op.drop_column("users", "delete_failed_attempts")

"""add soft delete to users

Revision ID: 2fffcc9c4831
Revises: ffd037e48826
Create Date: 2026-03-15 22:09:40.800728

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2fffcc9c4831'
down_revision: Union[str, Sequence[str], None] = 'ffd037e48826'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "users",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade():
    op.drop_column("users", "created_at")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "is_deleted")
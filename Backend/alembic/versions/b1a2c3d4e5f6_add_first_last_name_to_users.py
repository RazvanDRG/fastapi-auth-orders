"""add first_name and last_name to users

Revision ID: b1a2c3d4e5f6
Revises: 8e71b203343b
Create Date: 2026-03-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1a2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "8e71b203343b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column("users", sa.Column("first_name", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(length=100), nullable=True))


def downgrade():
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
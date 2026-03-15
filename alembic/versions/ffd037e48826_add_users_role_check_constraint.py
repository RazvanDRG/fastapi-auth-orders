"""add users role check constraint

Revision ID: ffd037e48826
Revises: a0fe1ee2884d
Create Date: 2026-03-15 18:50:33.186461

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ffd037e48826'
down_revision: Union[str, Sequence[str], None] = 'a0fe1ee2884d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute("""
        ALTER TABLE users
        DROP CONSTRAINT IF EXISTS ck_users_role_allowed
    """)

    op.create_check_constraint(
        "ck_users_role_allowed",
        "users",
        "role IN ('admin', 'operator', 'service')"
    )


def downgrade():
    op.execute("""
        ALTER TABLE users
        DROP CONSTRAINT IF EXISTS ck_users_role_allowed
    """)

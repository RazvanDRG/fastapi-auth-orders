"""add role check constraint

Revision ID: a0fe1ee2884d
Revises: d67a68dd61c9
Create Date: 2026-03-01 18:22:33.510815

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a0fe1ee2884d'
down_revision: Union[str, Sequence[str], None] = 'd67a68dd61c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute(
        """
        ALTER TABLE users
        ADD CONSTRAINT ck_users_role_allowed
        CHECK (role IN ('admin', 'operator', 'service'))
        """
    )


def downgrade():
    op.execute(
        """
        ALTER TABLE users
        DROP CONSTRAINT ck_users_role_allowed
        """
    )

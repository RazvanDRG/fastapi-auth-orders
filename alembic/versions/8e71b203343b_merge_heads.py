"""merge heads

Revision ID: 8e71b203343b
Revises: 33df0e4f0eb6, 5412c7cbd8b1
Create Date: 2026-03-27 23:45:33.065730

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8e71b203343b'
down_revision = ('33df0e4f0eb6', '5412c7cbd8b1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

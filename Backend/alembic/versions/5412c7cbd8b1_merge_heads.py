"""merge heads

Revision ID: 5412c7cbd8b1
Revises: 0142ddd31192, 2842f4a4a92e
Create Date: 2026-02-06 22:28:03.843497

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5412c7cbd8b1'
down_revision = '0142ddd31192'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

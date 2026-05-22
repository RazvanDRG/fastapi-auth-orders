"""add_event_type_to_inventory_events

Revision ID: 1bce1411f26a
Revises: eb1ea06dab1b
Create Date: 2026-05-22 20:38:06.376994

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1bce1411f26a'
down_revision: Union[str, Sequence[str], None] = 'eb1ea06dab1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'inventory_events',
        sa.Column('event_type', sa.String(50), nullable=True, server_default='stock_adjusted')
    )


def downgrade() -> None:
    op.drop_column('inventory_events', 'event_type')

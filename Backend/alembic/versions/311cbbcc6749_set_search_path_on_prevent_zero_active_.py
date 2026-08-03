"""set_search_path_on_prevent_zero_active_admins

Revision ID: 311cbbcc6749
Revises: 334a5d982c0d
Create Date: 2026-08-03 20:55:21.425907

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '311cbbcc6749'
down_revision: Union[str, Sequence[str], None] = '334a5d982c0d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER FUNCTION public.prevent_zero_active_admins() 
        SET search_path = public;
    """)

def downgrade() -> None:
    op.execute("""
        ALTER FUNCTION public.prevent_zero_active_admins() 
        RESET search_path;
    """)

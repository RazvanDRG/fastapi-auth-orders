"""unique (source_company, reference) on orders

Revision ID: c7d2e9a4b310
Revises: 6500d881500c
Create Date: 2026-10-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d2e9a4b310'
down_revision: Union[str, Sequence[str], None] = '6500d881500c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Fail before touching the schema if existing rows would violate the constraint,
    # so the operator gets a list of what to clean up instead of a raw IntegrityError.
    duplicates = op.get_bind().execute(sa.text(
        """
        SELECT source_company, reference, array_agg(id ORDER BY id) AS order_ids
        FROM orders
        WHERE source_company IS NOT NULL AND reference IS NOT NULL
        GROUP BY source_company, reference
        HAVING count(*) > 1
        ORDER BY source_company, reference
        """
    )).fetchall()

    if duplicates:
        lines = "\n".join(
            f"  source_company={row.source_company!r} reference={row.reference!r} order_ids={list(row.order_ids)}"
            for row in duplicates
        )
        raise RuntimeError(
            "Cannot add uq_orders_source_company_reference: duplicate integration orders exist. "
            "Resolve them manually, then rerun the migration.\n" + lines
        )

    op.create_unique_constraint(
        "uq_orders_source_company_reference",
        "orders",
        ["source_company", "reference"],
    )


def downgrade():
    op.drop_constraint("uq_orders_source_company_reference", "orders", type_="unique")

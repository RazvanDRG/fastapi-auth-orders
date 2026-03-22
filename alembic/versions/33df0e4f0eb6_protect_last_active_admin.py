"""protect last active admin

Revision ID: 33df0e4f0eb6
Revises: 2fffcc9c4831
Create Date: 2026-03-22 22:24:16.540225

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '33df0e4f0eb6'
down_revision: Union[str, Sequence[str], None] = '2fffcc9c4831'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_zero_active_admins()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Case 1: hard delete of an active admin
            IF TG_OP = 'DELETE'
               AND OLD.role = 'admin'
               AND OLD.is_deleted = false THEN

                IF (
                    SELECT COUNT(*)
                    FROM users
                    WHERE role = 'admin'
                      AND is_deleted = false
                ) <= 1 THEN
                    RAISE EXCEPTION 'Cannot remove the last active admin';
                END IF;

                RETURN OLD;
            END IF;

            -- Case 2: demoting an active admin to non-admin
            IF TG_OP = 'UPDATE'
               AND OLD.role = 'admin'
               AND OLD.is_deleted = false
               AND NEW.role <> 'admin' THEN

                IF (
                    SELECT COUNT(*)
                    FROM users
                    WHERE role = 'admin'
                      AND is_deleted = false
                ) <= 1 THEN
                    RAISE EXCEPTION 'Cannot demote the last active admin';
                END IF;

                RETURN NEW;
            END IF;

            -- Case 3: soft-deleting an active admin
            IF TG_OP = 'UPDATE'
               AND OLD.role = 'admin'
               AND OLD.is_deleted = false
               AND NEW.is_deleted = true THEN

                IF (
                    SELECT COUNT(*)
                    FROM users
                    WHERE role = 'admin'
                      AND is_deleted = false
                ) <= 1 THEN
                    RAISE EXCEPTION 'Cannot soft-delete the last active admin';
                END IF;

                RETURN NEW;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_prevent_zero_active_admins_update
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION prevent_zero_active_admins();
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_prevent_zero_active_admins_delete
        BEFORE DELETE ON users
        FOR EACH ROW
        EXECUTE FUNCTION prevent_zero_active_admins();
        """
    )


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_prevent_zero_active_admins_update ON users;")
    op.execute("DROP TRIGGER IF EXISTS trg_prevent_zero_active_admins_delete ON users;")
    op.execute("DROP FUNCTION IF EXISTS prevent_zero_active_admins();")

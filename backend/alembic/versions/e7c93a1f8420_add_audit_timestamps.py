"""add audit timestamps

Revision ID: e7c93a1f8420
Revises: d4f8b62e7c19
Create Date: 2026-05-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e7c93a1f8420"
down_revision: str | Sequence[str] | None = "d4f8b62e7c19"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

AUDITED_TABLES = ("harbors", "docks", "berths", "nodes", "alerts")


def upgrade() -> None:
    # trigger covers raw SQL paths the orm onupdate hook misses
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    for table in AUDITED_TABLES:
        op.add_column(
            table,
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.add_column(
            table,
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.execute(
            f"""
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
            """
        )

    # cheap insurance, app still sets adopted_at explicitly
    op.alter_column(
        "nodes",
        "adopted_at",
        server_default=sa.func.now(),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "nodes",
        "adopted_at",
        server_default=None,
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    for table in AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table};")
        op.drop_column(table, "updated_at")
        op.drop_column(table, "created_at")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at();")

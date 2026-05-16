"""add node_id to adoption_requests

Revision ID: 4016218e86d3
Revises: a594911d2a28
Create Date: 2026-05-16 22:13:34.472489

Pre-mints the assigned Node.node_id at adoption-request time so the
backend can ship it to the gateway in provision/req. Firmware persists
the value and echoes it back in every status/heartbeat, restoring the
identity check that was disabled in the prior hotfix.

Add nullable, backfill existing rows with a fresh uuid (the gateway
never received them so the value is purely a placeholder), then promote
to NOT NULL. Postgres 13+ has gen_random_uuid() built in, no pgcrypto.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "4016218e86d3"
down_revision: str | Sequence[str] | None = "a594911d2a28"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "adoption_requests",
        sa.Column("node_id", sa.String(), nullable=True),
    )
    op.execute(
        "UPDATE adoption_requests SET node_id = gen_random_uuid()::text "
        "WHERE node_id IS NULL"
    )
    op.alter_column("adoption_requests", "node_id", nullable=False)


def downgrade() -> None:
    op.drop_column("adoption_requests", "node_id")

"""add mesh_unicast_addr to events

Revision ID: 6c273ed76aa2
Revises: 8e1d9c5a2b40
Create Date: 2026-05-07

Mirror the new mesh_unicast_addr field on the status MQTT payload onto
the events table so state changes carry the publishing addr. NOT NULL
straight away since pre-alpha demo has no rows to backfill.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "6c273ed76aa2"
down_revision: str | Sequence[str] | None = "8e1d9c5a2b40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # pre-alpha, no events to backfill so NOT NULL goes straight on
    op.execute(sa.text("DELETE FROM events"))
    op.add_column(
        "events",
        sa.Column("mesh_unicast_addr", sa.String(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("events", "mesh_unicast_addr")

"""add node_id and sensor_raw to events

Revision ID: ebdab4bc8d25
Revises: ebf9af948b5b
Create Date: 2026-04-20

The initial schema migration omitted node_id and sensor_raw from the
events table, even though the ORM model and MQTT event writer both
expect them. Insert attempts against the deployed DB fail with
UndefinedColumn and crash the MQTT listener. Pre-alpha demo: no rows
to backfill, so both columns are added NOT NULL straight away.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "ebdab4bc8d25"
down_revision: str | Sequence[str] | None = "ebf9af948b5b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("DELETE FROM events"))
    op.add_column(
        "events",
        sa.Column("node_id", sa.String(), nullable=False),
    )
    op.add_column(
        "events",
        sa.Column("sensor_raw", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("events", "sensor_raw")
    op.drop_column("events", "node_id")

"""add manual override columns to berths

Revision ID: a7b3c4d8f1e2
Revises: e9cca47ab08f
Create Date: 2026-05-19 20:00:00.000000

Adds admin override + sensor truth columns so harbormasters can
pre-stage berth state for demos. manual_status_locked=true blocks the
sensor from changing displayed status; locked=false lets the next
sensor reading consume the override. sensor_status preserves ground
truth so revert restores the real state instead of defaulting to free.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7b3c4d8f1e2"
down_revision: str | Sequence[str] | None = "e9cca47ab08f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    berth_status = sa.Enum("free", "occupied", name="berth_status", create_type=False)
    op.add_column("berths", sa.Column("sensor_status", berth_status, nullable=True))
    op.add_column("berths", sa.Column("manual_status", berth_status, nullable=True))
    op.add_column(
        "berths",
        sa.Column(
            "manual_status_locked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "berths", sa.Column("manual_status_set_by", sa.String(), nullable=True)
    )
    op.add_column(
        "berths",
        sa.Column("manual_status_set_at", sa.DateTime(timezone=True), nullable=True),
    )
    # backfill sensor_status from current status so revert has something to
    # restore on rows that already have telemetry
    op.execute("UPDATE berths SET sensor_status = status")


def downgrade() -> None:
    op.drop_column("berths", "manual_status_set_at")
    op.drop_column("berths", "manual_status_set_by")
    op.drop_column("berths", "manual_status_locked")
    op.drop_column("berths", "manual_status")
    op.drop_column("berths", "sensor_status")

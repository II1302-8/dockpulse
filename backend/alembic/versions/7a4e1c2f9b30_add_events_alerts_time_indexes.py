"""add events/alerts time indexes

Revision ID: 7a4e1c2f9b30
Revises: 6c273ed76aa2
Create Date: 2026-05-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7a4e1c2f9b30"
down_revision: str | Sequence[str] | None = "6c273ed76aa2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # composite covers berth-only queries via leftmost prefix, drop redundant
    op.drop_index("ix_events_berth_id", table_name="events")
    op.create_index(
        "ix_events_berth_id_timestamp",
        "events",
        ["berth_id", sa.text("timestamp DESC")],
    )
    # serves recent-unacked dashboard query
    op.create_index(
        "ix_alerts_acknowledged_timestamp",
        "alerts",
        ["acknowledged", sa.text("timestamp DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_alerts_acknowledged_timestamp", table_name="alerts")
    op.drop_index("ix_events_berth_id_timestamp", table_name="events")
    op.create_index("ix_events_berth_id", "events", ["berth_id"])

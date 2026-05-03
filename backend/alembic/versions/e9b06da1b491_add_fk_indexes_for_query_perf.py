"""add fk indexes for query perf

Revision ID: e9b06da1b491
Revises: f7a83c1d9e02
Create Date: 2026-05-01 21:11:35.806953

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e9b06da1b491"
down_revision: str | Sequence[str] | None = "f7a83c1d9e02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_docks_harbor_id", "docks", ["harbor_id"])
    op.create_index("ix_berths_dock_id", "berths", ["dock_id"])
    op.create_index("ix_events_berth_id", "events", ["berth_id"])
    op.create_index("ix_alerts_berth_id", "alerts", ["berth_id"])
    op.create_index("ix_nodes_gateway_id", "nodes", ["gateway_id"])
    op.create_index("ix_nodes_adopted_by_user_id", "nodes", ["adopted_by_user_id"])
    op.create_index(
        "ix_adoption_requests_gateway_id", "adoption_requests", ["gateway_id"]
    )
    op.create_index(
        "ix_adoption_requests_berth_id", "adoption_requests", ["berth_id"]
    )
    op.create_index(
        "ix_adoption_requests_created_by_user_id",
        "adoption_requests",
        ["created_by_user_id"],
    )
    # Sweeper hot path filters on pending only.
    op.create_index(
        "ix_adoption_requests_pending_expires_at",
        "adoption_requests",
        ["expires_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_adoption_requests_pending_expires_at", table_name="adoption_requests"
    )
    op.drop_index(
        "ix_adoption_requests_created_by_user_id", table_name="adoption_requests"
    )
    op.drop_index("ix_adoption_requests_berth_id", table_name="adoption_requests")
    op.drop_index("ix_adoption_requests_gateway_id", table_name="adoption_requests")
    op.drop_index("ix_nodes_adopted_by_user_id", table_name="nodes")
    op.drop_index("ix_nodes_gateway_id", table_name="nodes")
    op.drop_index("ix_alerts_berth_id", table_name="alerts")
    op.drop_index("ix_events_berth_id", table_name="events")
    op.drop_index("ix_berths_dock_id", table_name="berths")
    op.drop_index("ix_docks_harbor_id", table_name="docks")

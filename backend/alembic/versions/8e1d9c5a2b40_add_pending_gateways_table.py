"""add pending_gateways table for unknown-id visibility

Revision ID: 8e1d9c5a2b40
Revises: 4c2e9f81a3b7
Create Date: 2026-05-06 12:30:00.000000

Currently mqtt status messages from unknown gateway ids are silently
dropped (mqtt.py _handle_gateway_status). Harbormasters had no way to see
"a device tried to register but I never created its row". This sibling
table records those attempts so the UI / dpcli can surface them.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8e1d9c5a2b40"
down_revision: str | Sequence[str] | None = "4c2e9f81a3b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pending_gateways",
        sa.Column("gateway_id", sa.String(), primary_key=True),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_table("pending_gateways")

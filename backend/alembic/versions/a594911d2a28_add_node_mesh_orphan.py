"""add nodes.mesh_orphan flag

Revision ID: a594911d2a28
Revises: a9c3f1d8e502
Create Date: 2026-05-16 00:00:00.000000

Set when a decommission/resp arrives with status=orphan: local cleanup on
the gateway succeeded but the node never ack'd the Config Node Reset, so
the sensor may still hold mesh keys. Surfaced in admin so operator knows
to hard-reset the physical device.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a594911d2a28"
down_revision: str | Sequence[str] | None = "a9c3f1d8e502"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "nodes",
        sa.Column(
            "mesh_orphan",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("nodes", "mesh_orphan")

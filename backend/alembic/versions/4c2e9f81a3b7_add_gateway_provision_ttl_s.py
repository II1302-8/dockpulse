"""add gateway provision_ttl_s override

Revision ID: 4c2e9f81a3b7
Revises: d2f1a0c93e74
Create Date: 2026-05-06 12:00:00.000000

Some BLE-mesh handshakes need >180s on flaky RF; others want a tighter 60s
to fail fast. Per-gateway override on the request TTL so harbormasters can
tune without code changes. NULL falls back to the global default in code.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "4c2e9f81a3b7"
down_revision: str | Sequence[str] | None = "d2f1a0c93e74"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "gateways",
        sa.Column("provision_ttl_s", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gateways", "provision_ttl_s")

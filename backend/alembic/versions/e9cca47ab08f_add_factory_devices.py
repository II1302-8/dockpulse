"""add factory_devices

Revision ID: e9cca47ab08f
Revises: 4016218e86d3
Create Date: 2026-05-16 22:37:25.668127

Backs the COSE+base45 QR rollout: the QR no longer carries uuid/oob,
backend resolves them by serial via this table, populated by
tools/factory-flash.py through POST /api/admin/factory-devices at
flash time.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e9cca47ab08f"
down_revision: str | Sequence[str] | None = "4016218e86d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "factory_devices",
        sa.Column("serial_number", sa.String(), primary_key=True),
        sa.Column("mesh_uuid", sa.String(), nullable=False, unique=True),
        sa.Column("oob_hex", sa.String(), nullable=False),
        sa.Column("claim_jti", sa.String(), nullable=False, unique=True),
        sa.Column("claim_exp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("factory_devices")

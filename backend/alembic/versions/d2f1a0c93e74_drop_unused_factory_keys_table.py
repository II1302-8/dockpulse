"""drop unused factory_keys table

Revision ID: d2f1a0c93e74
Revises: b4ed7129d0bf
Create Date: 2026-05-06 09:00:00.000000

The table was reserved for future multi-key rotation but the verifier reads
FACTORY_PUBKEY env directly. Removing the orphan removes a "two sources of
truth" smell. Multi-key can come back when there's a real second factory.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d2f1a0c93e74"
down_revision: str | Sequence[str] | None = "b4ed7129d0bf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("factory_keys")


def downgrade() -> None:
    op.create_table(
        "factory_keys",
        sa.Column("key_id", sa.String(), nullable=False),
        sa.Column("algorithm", sa.String(), nullable=False),
        sa.Column("public_key_pem", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("key_id"),
    )

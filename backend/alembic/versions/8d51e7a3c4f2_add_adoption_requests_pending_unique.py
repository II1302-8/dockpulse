"""add adoption_requests pending unique

Revision ID: 8d51e7a3c4f2
Revises: 7a4e1c2f9b30
Create Date: 2026-05-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8d51e7a3c4f2"
down_revision: str | Sequence[str] | None = "7a4e1c2f9b30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # one in-flight claim per (mesh_uuid, gateway_id), retries after expiry stay valid
    op.create_index(
        "uq_adoption_requests_pending_mesh_gateway",
        "adoption_requests",
        ["mesh_uuid", "gateway_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_adoption_requests_pending_mesh_gateway",
        table_name="adoption_requests",
    )

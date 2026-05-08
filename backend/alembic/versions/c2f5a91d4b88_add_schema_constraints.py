"""add schema constraints

Revision ID: c2f5a91d4b88
Revises: 8d51e7a3c4f2
Create Date: 2026-05-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c2f5a91d4b88"
down_revision: str | Sequence[str] | None = "8d51e7a3c4f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # one label per dock, null labels skip the check
    op.create_index(
        "uq_berths_dock_id_label",
        "berths",
        ["dock_id", "label"],
        unique=True,
        postgresql_where=sa.text("label IS NOT NULL"),
    )
    # forbid zero/negative duration windows
    op.create_check_constraint(
        "ck_berth_availability_windows_dates",
        "berth_availability_windows",
        "return_date > from_date",
    )
    # revoke-all-for-user is a hot path on token rotation
    op.create_index(
        "ix_refresh_tokens_user_active",
        "refresh_tokens",
        ["user_id"],
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    # harbor-wide free/occupied filters
    op.create_index("ix_berths_status", "berths", ["status"])


def downgrade() -> None:
    op.drop_index("ix_berths_status", table_name="berths")
    op.drop_index("ix_refresh_tokens_user_active", table_name="refresh_tokens")
    op.drop_constraint(
        "ck_berth_availability_windows_dates",
        "berth_availability_windows",
        type_="check",
    )
    op.drop_index("uq_berths_dock_id_label", table_name="berths")

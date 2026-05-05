"""add berth availability windows table

Revision ID: 1ed9b261de20
Revises: 2dfb33216c12
Create Date: 2026-05-05 10:06:00.461601

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "1ed9b261de20"
down_revision: str | Sequence[str] | None = "2dfb33216c12"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "berth_availability_windows",
        sa.Column("window_id", sa.String(), nullable=False),
        sa.Column("berth_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("from_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("return_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["berth_id"], ["berths.berth_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("window_id"),
    )
    op.create_index(
        "ix_berth_availability_windows_berth_id",
        "berth_availability_windows",
        ["berth_id"],
    )
    op.create_index(
        "ix_berth_availability_windows_user_id",
        "berth_availability_windows",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_berth_availability_windows_user_id",
        table_name="berth_availability_windows",
    )
    op.drop_index(
        "ix_berth_availability_windows_berth_id",
        table_name="berth_availability_windows",
    )
    op.drop_table("berth_availability_windows")

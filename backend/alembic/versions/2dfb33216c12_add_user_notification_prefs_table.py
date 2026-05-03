"""add user_notification_prefs table

Revision ID: 2dfb33216c12
Revises: a1f3c8d27b50
Create Date: 2026-05-03 01:04:25.114981

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "2dfb33216c12"
down_revision: str | Sequence[str] | None = "a1f3c8d27b50"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_notification_prefs",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column(
            "notify_arrival",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "notify_departure",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_notification_prefs")

"""add assignments table and berths.is_reserved

Revision ID: a1f3c8d27b50
Revises: c7db3b5864c9
Create Date: 2026-05-02 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1f3c8d27b50"
down_revision: str | Sequence[str] | None = "c7db3b5864c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "berths",
        sa.Column(
            "is_reserved",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column("berths", "is_reserved", server_default=None)

    op.create_table(
        "assignments",
        sa.Column("berth_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ["berth_id"], ["berths.berth_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("berth_id"),
    )
    op.create_index("ix_assignments_user_id", "assignments", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_assignments_user_id", table_name="assignments")
    op.drop_table("assignments")
    op.drop_column("berths", "is_reserved")

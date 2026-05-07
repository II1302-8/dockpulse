"""add_email_verification

Revision ID: da492cf8c15a
Revises: 6c273ed76aa2
Create Date: 2026-05-07 15:33:12.486610

Creates user_verifications table for single-use email verification tokens and
adds email_verified to users. Backfills existing rows to True — pre-existing
accounts are trusted and must not be locked out.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "da492cf8c15a"
down_revision: str | Sequence[str] | None = "6c273ed76aa2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_verifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "used",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_user_verifications_token", "user_verifications", ["token"], unique=True
    )
    op.create_index(
        "ix_user_verifications_user_id", "user_verifications", ["user_id"]
    )
    op.create_index(
        "ix_user_verifications_expires_at", "user_verifications", ["expires_at"]
    )

    op.add_column(
        "users",
        sa.Column(
            "email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # backfill: existing accounts are trusted, don't lock them out
    op.execute("UPDATE users SET email_verified = true")


def downgrade() -> None:
    op.drop_column("users", "email_verified")
    op.drop_index("ix_user_verifications_expires_at", "user_verifications")
    op.drop_index("ix_user_verifications_user_id", "user_verifications")
    op.drop_index("ix_user_verifications_token", "user_verifications")
    op.drop_table("user_verifications")

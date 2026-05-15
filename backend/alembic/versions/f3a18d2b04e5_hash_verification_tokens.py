"""hash verification tokens + merge heads

Revision ID: f3a18d2b04e5
Revises: 18a08a270460, ebdab4bc8d25
Create Date: 2026-05-13 09:00:00.000000

Hashes user_verifications.token so a DB read doesn't yield usable email
verification links (matches the berth_invites approach). Existing tokens
are marked used because we can no longer recover the plaintext to hash
them — affected users can request a new link from the in-app banner.

Also merges the two outstanding alembic heads
(18a08a270460 + ebdab4bc8d25) so the migration graph has a single tip
again.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f3a18d2b04e5"
down_revision: str | Sequence[str] | None = ("18a08a270460", "ebdab4bc8d25")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # additive: keep token column nullable so the migration is safe to roll back
    op.add_column(
        "user_verifications",
        sa.Column("token_hash", sa.LargeBinary(), nullable=True),
    )
    # invalidate every existing plaintext token; users request a fresh link
    op.execute("UPDATE user_verifications SET used = true WHERE used = false")
    # purge those now-dead rows: we can't backfill token_hash (no plaintext)
    # and the upcoming NOT NULL + UNIQUE would fail on null values. nothing
    # of value is lost; affected users get a fresh link from the in-app banner
    op.execute("DELETE FROM user_verifications WHERE token_hash IS NULL")
    # drop the plaintext column once invalidation is committed
    op.drop_index(
        "ix_user_verifications_token", table_name="user_verifications"
    )
    op.drop_column("user_verifications", "token")
    # token_hash is the new lookup key
    op.alter_column(
        "user_verifications",
        "token_hash",
        existing_type=sa.LargeBinary(),
        nullable=False,
    )
    op.create_unique_constraint(
        "uq_user_verifications_token_hash",
        "user_verifications",
        ["token_hash"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_user_verifications_token_hash",
        "user_verifications",
        type_="unique",
    )
    op.add_column(
        "user_verifications",
        sa.Column("token", sa.String(), nullable=True),
    )
    op.drop_column("user_verifications", "token_hash")
    op.alter_column(
        "user_verifications",
        "token",
        existing_type=sa.String(),
        nullable=False,
    )
    op.create_index(
        "ix_user_verifications_token",
        "user_verifications",
        ["token"],
        unique=True,
    )

"""add berth invitation table

Revision ID: 51a9521408a9
Revises: da492cf8c15a
Create Date: 2026-05-12 13:41:47.916085

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import CITEXT


revision: str = "51a9521408a9"
down_revision: Union[str, Sequence[str], None] = "da492cf8c15a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.create_table(
        "berth_invites",
        sa.Column("invite_id", sa.String(), nullable=False),
        sa.Column("berth_id", sa.String(), nullable=False),
        sa.Column("harbor_id", sa.String(), nullable=False),
        sa.Column("email", CITEXT(), nullable=False),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "accepted",
                "expired",
                "revoked",
                "rejected",
                name="berth_invite_status",
            ),
            nullable=False,
        ),
        sa.Column("accepted_by", sa.String(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["accepted_by"], ["users.user_id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["berth_id"], ["berths.berth_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.user_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["harbor_id"], ["harbors.harbor_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("invite_id"),
        sa.UniqueConstraint("token_hash", name="uq_berth_invites_token_hash"),
    )
    op.create_index(
        "ix_berth_invites_berth_id", "berth_invites", ["berth_id"], unique=False
    )
    op.create_index(
        "ix_berth_invites_harbor_id", "berth_invites", ["harbor_id"], unique=False
    )
    # one pending invite per berth, race-safe at the db layer
    op.create_index(
        "uq_berth_invites_berth_pending",
        "berth_invites",
        ["berth_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_berth_invites_berth_pending", table_name="berth_invites")
    op.drop_index("ix_berth_invites_harbor_id", table_name="berth_invites")
    op.drop_index("ix_berth_invites_berth_id", table_name="berth_invites")
    op.drop_table("berth_invites")
    sa.Enum(name="berth_invite_status").drop(op.get_bind(), checkfirst=False)

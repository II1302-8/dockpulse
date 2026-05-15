"""rename berth_invites accepted_by/at to resolved_by/at

Revision ID: a9c3f1d8e502
Revises: b6f12e9c8d44
Create Date: 2026-05-15 00:00:00.000000

accepted_by and accepted_at were reused for reject flows, making the column
names misleading. resolved_by/resolved_at cover accept, reject, and revoke.
"""

from alembic import op

revision = "a9c3f1d8e502"
down_revision = "b6f12e9c8d44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("berth_invites", "accepted_by", new_column_name="resolved_by")
    op.alter_column("berth_invites", "accepted_at", new_column_name="resolved_at")


def downgrade() -> None:
    op.alter_column("berth_invites", "resolved_by", new_column_name="accepted_by")
    op.alter_column("berth_invites", "resolved_at", new_column_name="accepted_at")

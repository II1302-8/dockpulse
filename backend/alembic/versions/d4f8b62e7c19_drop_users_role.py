"""drop users.role and user_role enum

Revision ID: d4f8b62e7c19
Revises: c2f5a91d4b88
Create Date: 2026-05-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4f8b62e7c19"
down_revision: str | Sequence[str] | None = "c2f5a91d4b88"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # user_harbor_roles is the single source for harbormaster scoping
    op.drop_column("users", "role")
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=False)


def downgrade() -> None:
    user_role = sa.Enum("harbormaster", "boat_owner", name="user_role")
    user_role.create(op.get_bind(), checkfirst=False)
    op.add_column(
        "users",
        sa.Column(
            "role",
            user_role,
            nullable=False,
            server_default="boat_owner",
        ),
    )
    # backfill harbormaster from grants
    op.execute(
        "UPDATE users SET role = 'harbormaster' "
        "WHERE user_id IN (SELECT user_id FROM user_harbor_roles)"
    )
    op.alter_column("users", "role", server_default=None)

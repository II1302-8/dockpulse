"""add user_harbor_roles for harbor scoped authz

Revision ID: 43e642039c65
Revises: 3b8f4d2c1e7a
Create Date: 2026-05-06 00:20:13.453384

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "43e642039c65"
down_revision: str | Sequence[str] | None = "3b8f4d2c1e7a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_harbor_roles",
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "harbor_id",
            sa.String(),
            sa.ForeignKey("harbors.harbor_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "harbor_id", "role"),
        sa.CheckConstraint(
            "role = 'harbormaster'", name="user_harbor_roles_role_check"
        ),
    )
    op.create_index(
        "ix_user_harbor_roles_harbor_id", "user_harbor_roles", ["harbor_id"]
    )
    op.create_index(
        "ix_user_harbor_roles_user_id", "user_harbor_roles", ["user_id"]
    )

    # backfill: every existing harbormaster gets authority over every harbor
    # single-tenant world today, so this preserves current behaviour exactly
    op.execute(
        """
        INSERT INTO user_harbor_roles (user_id, harbor_id, role)
        SELECT u.user_id, h.harbor_id, 'harbormaster'
        FROM users u CROSS JOIN harbors h
        WHERE u.role = 'harbormaster'
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_user_harbor_roles_user_id", "user_harbor_roles")
    op.drop_index("ix_user_harbor_roles_harbor_id", "user_harbor_roles")
    op.drop_table("user_harbor_roles")

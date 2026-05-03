"""add token_version to users

Revision ID: c7db3b5864c9
Revises: e9b06da1b491
Create Date: 2026-05-02 19:58:16.728889

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c7db3b5864c9"
down_revision: str | Sequence[str] | None = "e9b06da1b491"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.alter_column("users", "token_version", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "token_version")

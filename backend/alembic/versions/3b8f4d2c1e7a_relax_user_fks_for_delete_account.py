"""relax node and adoption_request user FKs for account deletion

Revision ID: 3b8f4d2c1e7a
Revises: 1ed9b261de20
Create Date: 2026-05-05 13:00:00.000000

Account deletion needs to leave historical hardware records intact.
Switches nodes.adopted_by_user_id and adoption_requests.created_by_user_id
to nullable + ON DELETE SET NULL so deleting a user nulls the audit pointer
without destroying the row.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "3b8f4d2c1e7a"
down_revision: str | Sequence[str] | None = "1ed9b261de20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("nodes", "adopted_by_user_id", nullable=True)
    op.drop_constraint(
        "nodes_adopted_by_user_id_fkey", "nodes", type_="foreignkey"
    )
    op.create_foreign_key(
        "nodes_adopted_by_user_id_fkey",
        "nodes",
        "users",
        ["adopted_by_user_id"],
        ["user_id"],
        ondelete="SET NULL",
    )

    op.alter_column("adoption_requests", "created_by_user_id", nullable=True)
    op.drop_constraint(
        "adoption_requests_created_by_user_id_fkey",
        "adoption_requests",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "adoption_requests_created_by_user_id_fkey",
        "adoption_requests",
        "users",
        ["created_by_user_id"],
        ["user_id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "adoption_requests_created_by_user_id_fkey",
        "adoption_requests",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "adoption_requests_created_by_user_id_fkey",
        "adoption_requests",
        "users",
        ["created_by_user_id"],
        ["user_id"],
    )
    op.alter_column("adoption_requests", "created_by_user_id", nullable=False)

    op.drop_constraint(
        "nodes_adopted_by_user_id_fkey", "nodes", type_="foreignkey"
    )
    op.create_foreign_key(
        "nodes_adopted_by_user_id_fkey",
        "nodes",
        "users",
        ["adopted_by_user_id"],
        ["user_id"],
    )
    op.alter_column("nodes", "adopted_by_user_id", nullable=False)

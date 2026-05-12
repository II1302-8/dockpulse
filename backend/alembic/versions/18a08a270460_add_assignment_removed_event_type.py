"""add assignment_removed event type and event actor/subject columns

Revision ID: 18a08a270460
Revises: da492cf8c15a
Create Date: 2026-05-12 23:57:20.860726

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "18a08a270460"
down_revision: Union[str, Sequence[str], None] = "51a9521408a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE cannot run inside a transaction
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'assignment_removed'")

    # actor + subject support audit-only event types like assignment_removed
    # without overloading node_id/mesh_unicast_addr. nullable since existing
    # sensor events have no actor/subject
    op.add_column(
        "events",
        sa.Column("actor_user_id", sa.String(), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("subject_user_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_events_actor_user_id_users",
        "events",
        "users",
        ["actor_user_id"],
        ["user_id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_events_subject_user_id_users",
        "events",
        "users",
        ["subject_user_id"],
        ["user_id"],
        ondelete="SET NULL",
    )
    # sensor columns are required for hardware events but irrelevant for audit;
    # relax to nullable so audit events can insert with NULL
    op.alter_column("events", "node_id", existing_type=sa.String(), nullable=True)
    op.alter_column(
        "events", "sensor_raw", existing_type=sa.Integer(), nullable=True
    )
    op.alter_column(
        "events", "mesh_unicast_addr", existing_type=sa.String(), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "events", "mesh_unicast_addr", existing_type=sa.String(), nullable=False
    )
    op.alter_column(
        "events", "sensor_raw", existing_type=sa.Integer(), nullable=False
    )
    op.alter_column("events", "node_id", existing_type=sa.String(), nullable=False)
    op.drop_constraint(
        "fk_events_subject_user_id_users", "events", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_events_actor_user_id_users", "events", type_="foreignkey"
    )
    op.drop_column("events", "subject_user_id")
    op.drop_column("events", "actor_user_id")
    # postgres has no native ALTER TYPE DROP VALUE, recreate the enum without it
    op.execute("ALTER TYPE event_type RENAME TO event_type_old")
    op.execute(
        "CREATE TYPE event_type AS ENUM "
        "('occupied', 'freed', 'alert_unauthorized', 'heartbeat')"
    )
    op.execute(
        "ALTER TABLE events ALTER COLUMN event_type TYPE event_type "
        "USING event_type::text::event_type"
    )
    op.execute("DROP TYPE event_type_old")

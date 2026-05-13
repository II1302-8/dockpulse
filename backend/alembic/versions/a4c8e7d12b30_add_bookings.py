"""add_bookings

Revision ID: a4c8e7d12b30
Revises: f3a18d2b04e5
Create Date: 2026-05-13 10:00:00.000000

Creates bookings table for visitor reservations against spot-owner
availability windows. Uses a GiST EXCLUDE constraint (needs btree_gist)
so the database, not the app, guarantees no two confirmed bookings on
the same berth overlap.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a4c8e7d12b30"
down_revision: str | Sequence[str] | None = "f3a18d2b04e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    booking_status = postgresql.ENUM(
        "confirmed",
        "cancelled_by_visitor",
        "cancelled_by_host",
        "completed",
        name="booking_status",
    )
    booking_status.create(op.get_bind(), checkfirst=True)
    # reference the existing type from the column so create_table doesn't retry
    booking_status_ref = postgresql.ENUM(
        name="booking_status", create_type=False
    )

    op.create_table(
        "bookings",
        sa.Column("booking_id", sa.String(), primary_key=True),
        sa.Column(
            "berth_id",
            sa.String(),
            sa.ForeignKey("berths.berth_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("from_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("to_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            booking_status_ref,
            nullable=False,
            server_default=sa.text("'confirmed'"),
        ),
        sa.Column("boat_length_m", sa.Double(), nullable=True),
        sa.Column("boat_width_m", sa.Double(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column(
            "cancelled_by",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_reason", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("to_date > from_date", name="ck_bookings_dates"),
    )
    op.create_index("ix_bookings_berth_id_status", "bookings", ["berth_id", "status"])
    op.create_index("ix_bookings_user_id_status", "bookings", ["user_id", "status"])

    # half-open range [from_date, to_date) so back-to-back bookings don't collide
    op.execute(
        """
        ALTER TABLE bookings
        ADD CONSTRAINT bookings_no_overlap_confirmed
        EXCLUDE USING gist (
            berth_id WITH =,
            tstzrange(from_date, to_date, '[)') WITH &&
        ) WHERE (status = 'confirmed')
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap_confirmed"
    )
    op.drop_index("ix_bookings_user_id_status", "bookings")
    op.drop_index("ix_bookings_berth_id_status", "bookings")
    op.drop_table("bookings")
    postgresql.ENUM(name="booking_status").drop(op.get_bind(), checkfirst=True)

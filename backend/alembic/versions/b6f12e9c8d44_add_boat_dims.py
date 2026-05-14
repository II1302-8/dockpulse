"""add_boat_dims

Revision ID: b6f12e9c8d44
Revises: a4c8e7d12b30
Create Date: 2026-05-14 10:00:00.000000

Adds boat dimensions to users (length/width/depth) and boat_depth_m to
bookings. The user-level fields back the Settings → Boat dimensions UI;
the per-booking fields let visitors override the saved profile for a
specific trip.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b6f12e9c8d44"
down_revision: str | Sequence[str] | None = "a4c8e7d12b30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("boat_length_m", sa.Double(), nullable=True))
    op.add_column("users", sa.Column("boat_width_m", sa.Double(), nullable=True))
    op.add_column("users", sa.Column("boat_depth_m", sa.Double(), nullable=True))
    op.add_column("bookings", sa.Column("boat_depth_m", sa.Double(), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "boat_depth_m")
    op.drop_column("users", "boat_depth_m")
    op.drop_column("users", "boat_width_m")
    op.drop_column("users", "boat_length_m")

"""align seed data with harbor map (12 berths)

Revision ID: ebf9af948b5b
Revises: 143e62cd073b
Create Date: 2026-04-20

Replaces the 5 placeholder berths from the prior seed with 12 positional
berths matching the SVG harbor map in frontend/src/svg.ts: 4 top berths
along the horizontal pier, plus 4 left + 4 right along the vertical pier.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "ebf9af948b5b"
down_revision: str | Sequence[str] | None = "143e62cd073b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DOCK_ID = "ksss-saltsjobaden-pier-1"

BERTH_POSITIONS = (
    [("t", i) for i in range(1, 5)]
    + [("l", i) for i in range(1, 5)]
    + [("r", i) for i in range(1, 5)]
)


def _berth_id(side: str, idx: int) -> str:
    return f"{DOCK_ID}-{side}{idx}"


def upgrade() -> None:
    # Remove legacy B1–B5 placeholder seed.
    op.execute(
        sa.text("DELETE FROM berths WHERE dock_id = :dock").bindparams(dock=DOCK_ID)
    )
    for side, idx in BERTH_POSITIONS:
        op.execute(
            sa.text(
                "INSERT INTO berths "
                "(berth_id, dock_id, label, length_m, width_m, depth_m, status) "
                "VALUES (:id, :dock, :label, 12.0, 4.0, 3.0, 'free')"
            ).bindparams(
                id=_berth_id(side, idx),
                dock=DOCK_ID,
                label=f"{side.upper()}{idx}",
            )
        )


def downgrade() -> None:
    for side, idx in BERTH_POSITIONS:
        op.execute(
            sa.text("DELETE FROM berths WHERE berth_id = :id").bindparams(
                id=_berth_id(side, idx)
            )
        )

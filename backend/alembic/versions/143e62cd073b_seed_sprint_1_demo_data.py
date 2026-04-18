"""seed sprint 1 demo data

Revision ID: 143e62cd073b
Revises: 60d110ea711d
Create Date: 2026-04-17 08:33:16.787994

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '143e62cd073b'
down_revision: Union[str, Sequence[str], None] = '60d110ea711d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


HARBOR_ID = "ksss-saltsjobaden"
DOCK_ID = "ksss-saltsjobaden-pier-1"
BERTH_IDS = [f"{DOCK_ID}-b{i}" for i in range(1, 6)]

HARBOR_LAT = 59.2818
HARBOR_LNG = 18.3070


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO harbors (harbor_id, name, lat, lng) "
            "VALUES (:id, :name, :lat, :lng)"
        ).bindparams(
            id=HARBOR_ID, name="KSSS Saltsjöbaden", lat=HARBOR_LAT, lng=HARBOR_LNG
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO docks (dock_id, harbor_id, name) "
            "VALUES (:id, :harbor, :name)"
        ).bindparams(id=DOCK_ID, harbor=HARBOR_ID, name="KSSS Pier 1")
    )
    for i, berth_id in enumerate(BERTH_IDS):
        op.execute(
            sa.text(
                "INSERT INTO berths "
                "(berth_id, dock_id, label, length_m, width_m, depth_m, status) "
                "VALUES (:id, :dock, :label, 12.0, 4.0, 3.0, 'free')"
            ).bindparams(id=berth_id, dock=DOCK_ID, label=f"B{i + 1}")
        )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM berths WHERE dock_id = :dock").bindparams(dock=DOCK_ID)
    )
    op.execute(
        sa.text("DELETE FROM docks WHERE dock_id = :id").bindparams(id=DOCK_ID)
    )
    op.execute(
        sa.text("DELETE FROM harbors WHERE harbor_id = :id").bindparams(id=HARBOR_ID)
    )

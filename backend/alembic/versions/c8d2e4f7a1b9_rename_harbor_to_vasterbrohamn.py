"""rename harbor to Västerbrohamn and reseed to 5-berth L pier

Revision ID: c8d2e4f7a1b9
Revises: a7b3c4d8f1e2
Create Date: 2026-05-20

Replaces the 12-berth T-shaped seed (rename ksss-saltsjobaden →
ksss-vasterbrohamn, ksss-saltsjobaden-pier-1 → ksss-vasterbrohamn-pier-1)
with 5 berths b1–b5 matching the new L-shaped harbor map in
frontend/src/svg.ts. user_harbor_role assignments are retargeted to the
new harbor; berth-referencing rows in non-cascading tables (events,
alerts, nodes, adoption_requests, gateways) are wiped because there is no
1:1 mapping from the old 12-berth layout to the new 5.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c8d2e4f7a1b9"
down_revision: str | Sequence[str] | None = "a7b3c4d8f1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_HARBOR_ID = "ksss-saltsjobaden"
OLD_DOCK_ID = "ksss-saltsjobaden-pier-1"
NEW_HARBOR_ID = "ksss-vasterbrohamn"
NEW_DOCK_ID = "ksss-vasterbrohamn-pier-1"
NEW_HARBOR_NAME = "Västerbrohamn"
NEW_DOCK_NAME = "Pier 1"
HARBOR_LAT = 59.2818
HARBOR_LNG = 18.3070

NEW_BERTHS = [(f"{NEW_DOCK_ID}-b{i}", f"B{i}") for i in range(1, 6)]
OLD_BERTHS = (
    [(f"{OLD_DOCK_ID}-t{i}", f"T{i}") for i in range(1, 5)]
    + [(f"{OLD_DOCK_ID}-l{i}", f"L{i}") for i in range(1, 5)]
    + [(f"{OLD_DOCK_ID}-r{i}", f"R{i}") for i in range(1, 5)]
)


def upgrade() -> None:
    # new harbor first, so we have something to retarget user_harbor_roles at
    op.execute(
        sa.text(
            "INSERT INTO harbors (harbor_id, name, lat, lng) "
            "VALUES (:id, :name, :lat, :lng)"
        ).bindparams(
            id=NEW_HARBOR_ID, name=NEW_HARBOR_NAME, lat=HARBOR_LAT, lng=HARBOR_LNG
        )
    )
    # preserve harbormaster memberships
    op.execute(
        sa.text(
            "UPDATE user_harbor_roles SET harbor_id = :new WHERE harbor_id = :old"
        ).bindparams(new=NEW_HARBOR_ID, old=OLD_HARBOR_ID)
    )

    op.execute(
        sa.text(
            "INSERT INTO docks (dock_id, harbor_id, name) "
            "VALUES (:id, :harbor, :name)"
        ).bindparams(id=NEW_DOCK_ID, harbor=NEW_HARBOR_ID, name=NEW_DOCK_NAME)
    )
    for berth_id, label in NEW_BERTHS:
        op.execute(
            sa.text(
                "INSERT INTO berths "
                "(berth_id, dock_id, label, length_m, width_m, depth_m, status, is_reserved) "
                "VALUES (:id, :dock, :label, 12.0, 4.0, 3.0, 'free', false)"
            ).bindparams(id=berth_id, dock=NEW_DOCK_ID, label=label)
        )

    # wipe rows in non-cascading tables that reference the old berths/dock
    # before we delete them. bookings, invites, assignments, availability
    # windows cascade on berth delete, so they self-clean.
    op.execute(
        sa.text("DELETE FROM events WHERE berth_id LIKE :prefix").bindparams(
            prefix=f"{OLD_DOCK_ID}-%"
        )
    )
    op.execute(
        sa.text("DELETE FROM alerts WHERE berth_id LIKE :prefix").bindparams(
            prefix=f"{OLD_DOCK_ID}-%"
        )
    )
    op.execute(
        sa.text("DELETE FROM nodes WHERE berth_id LIKE :prefix").bindparams(
            prefix=f"{OLD_DOCK_ID}-%"
        )
    )
    op.execute(
        sa.text(
            "DELETE FROM adoption_requests WHERE berth_id LIKE :prefix"
        ).bindparams(prefix=f"{OLD_DOCK_ID}-%")
    )
    op.execute(
        sa.text("DELETE FROM gateways WHERE dock_id = :dock").bindparams(
            dock=OLD_DOCK_ID
        )
    )
    op.execute(
        sa.text("DELETE FROM berths WHERE dock_id = :dock").bindparams(
            dock=OLD_DOCK_ID
        )
    )
    op.execute(
        sa.text("DELETE FROM docks WHERE dock_id = :id").bindparams(id=OLD_DOCK_ID)
    )
    op.execute(
        sa.text("DELETE FROM harbors WHERE harbor_id = :id").bindparams(
            id=OLD_HARBOR_ID
        )
    )


def downgrade() -> None:
    # mirror image of upgrade: rebuild old layout, retarget roles, then drop new
    op.execute(
        sa.text(
            "INSERT INTO harbors (harbor_id, name, lat, lng) "
            "VALUES (:id, :name, :lat, :lng)"
        ).bindparams(
            id=OLD_HARBOR_ID,
            name="KSSS Saltsjöbaden",
            lat=HARBOR_LAT,
            lng=HARBOR_LNG,
        )
    )
    op.execute(
        sa.text(
            "UPDATE user_harbor_roles SET harbor_id = :old WHERE harbor_id = :new"
        ).bindparams(new=NEW_HARBOR_ID, old=OLD_HARBOR_ID)
    )
    op.execute(
        sa.text(
            "INSERT INTO docks (dock_id, harbor_id, name) "
            "VALUES (:id, :harbor, :name)"
        ).bindparams(id=OLD_DOCK_ID, harbor=OLD_HARBOR_ID, name="KSSS Pier 1")
    )
    for berth_id, label in OLD_BERTHS:
        op.execute(
            sa.text(
                "INSERT INTO berths "
                "(berth_id, dock_id, label, length_m, width_m, depth_m, status, is_reserved) "
                "VALUES (:id, :dock, :label, 12.0, 4.0, 3.0, 'free', false)"
            ).bindparams(id=berth_id, dock=OLD_DOCK_ID, label=label)
        )

    op.execute(
        sa.text("DELETE FROM events WHERE berth_id LIKE :prefix").bindparams(
            prefix=f"{NEW_DOCK_ID}-%"
        )
    )
    op.execute(
        sa.text("DELETE FROM alerts WHERE berth_id LIKE :prefix").bindparams(
            prefix=f"{NEW_DOCK_ID}-%"
        )
    )
    op.execute(
        sa.text("DELETE FROM nodes WHERE berth_id LIKE :prefix").bindparams(
            prefix=f"{NEW_DOCK_ID}-%"
        )
    )
    op.execute(
        sa.text(
            "DELETE FROM adoption_requests WHERE berth_id LIKE :prefix"
        ).bindparams(prefix=f"{NEW_DOCK_ID}-%")
    )
    op.execute(
        sa.text("DELETE FROM gateways WHERE dock_id = :dock").bindparams(
            dock=NEW_DOCK_ID
        )
    )
    op.execute(
        sa.text("DELETE FROM berths WHERE dock_id = :dock").bindparams(
            dock=NEW_DOCK_ID
        )
    )
    op.execute(
        sa.text("DELETE FROM docks WHERE dock_id = :id").bindparams(id=NEW_DOCK_ID)
    )
    op.execute(
        sa.text("DELETE FROM harbors WHERE harbor_id = :id").bindparams(
            id=NEW_HARBOR_ID
        )
    )

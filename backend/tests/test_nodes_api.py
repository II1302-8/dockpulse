from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Berth, Dock, Event, Gateway, Harbor, Node, User
from tests._helpers import make_auth_token as _auth_token


def _node(node_id: str, berth_id: str, gateway_id: str, *, user_id: str, **over):
    return Node(
        node_id=node_id,
        mesh_uuid=node_id.ljust(32, "0"),
        serial_number=f"DP-N-{node_id}",
        berth_id=berth_id,
        gateway_id=gateway_id,
        mesh_unicast_addr="0x0001",
        dev_key_fp="abc",
        status=over.pop("status", "provisioned"),
        adopted_at=over.pop("adopted_at", datetime.now(UTC)),
        adopted_by_user_id=user_id,
    )


@pytest_asyncio.fixture
async def fleet(session: AsyncSession, harbor_master: User):
    # FK ordering, gateway and node have no relationship() so flush order not enforced
    session.add_all([Harbor(harbor_id="h1", name="H1")])
    await session.commit()
    session.add_all([Dock(dock_id="d1", harbor_id="h1", name="D1")])
    await session.commit()
    now = datetime.now(UTC)
    session.add_all(
        [
            Berth(berth_id="b-online", dock_id="d1", status="free", last_updated=now),
            Berth(
                berth_id="b-stale",
                dock_id="d1",
                status="free",
                last_updated=now - timedelta(minutes=8),
                battery_pct=42,
            ),
            Berth(
                berth_id="b-offline",
                dock_id="d1",
                status="free",
                last_updated=now - timedelta(minutes=30),
            ),
            Berth(berth_id="b-never", dock_id="d1", status="free"),
            Berth(berth_id="b-decom", dock_id="d1", status="free", last_updated=now),
            Gateway(gateway_id="gw1", dock_id="d1", name="G1", status="online"),
        ]
    )
    await session.commit()
    session.add_all(
        [
            _node(
                "n-online",
                "b-online",
                "gw1",
                user_id=harbor_master.user_id,
                adopted_at=now - timedelta(days=1),
            ),
            _node(
                "n-stale",
                "b-stale",
                "gw1",
                user_id=harbor_master.user_id,
                adopted_at=now - timedelta(days=2),
            ),
            _node(
                "n-offline",
                "b-offline",
                "gw1",
                user_id=harbor_master.user_id,
                adopted_at=now - timedelta(days=3),
            ),
            _node(
                "n-never",
                "b-never",
                "gw1",
                user_id=harbor_master.user_id,
                adopted_at=now - timedelta(days=4),
            ),
            _node(
                "n-decom",
                "b-decom",
                "gw1",
                user_id=harbor_master.user_id,
                status="decommissioned",
                adopted_at=now - timedelta(days=5),
            ),
        ]
    )
    await session.commit()


async def test_list_nodes_requires_auth(client: AsyncClient, fleet):
    r = await client.get("/api/nodes")
    assert r.status_code == 401


async def test_list_nodes_rejects_boat_owner(
    client: AsyncClient, boat_owner: User, fleet
):
    r = await client.get(
        "/api/nodes",
        headers={"Authorization": f"Bearer {_auth_token(boat_owner.user_id)}"},
    )
    assert r.status_code == 403


async def test_list_nodes_returns_all_with_derived_health(
    client: AsyncClient, harbor_master: User, fleet
):
    r = await client.get(
        "/api/nodes",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    by_id = {row["node_id"]: row for row in r.json()}
    assert by_id["n-online"]["health"] == "online"
    assert by_id["n-stale"]["health"] == "stale"
    assert by_id["n-offline"]["health"] == "offline"
    # null last_updated counts as offline
    assert by_id["n-never"]["health"] == "offline"
    # decommissioned wins over freshness
    assert by_id["n-decom"]["health"] == "decommissioned"
    assert by_id["n-stale"]["battery_pct"] == 42


async def test_list_nodes_filters_by_health(
    client: AsyncClient, harbor_master: User, fleet
):
    r = await client.get(
        "/api/nodes?health=offline",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    ids = sorted(row["node_id"] for row in r.json())
    assert ids == ["n-never", "n-offline"]


async def test_list_nodes_filters_by_gateway(
    client: AsyncClient, session: AsyncSession, harbor_master: User, fleet
):
    # one gateway per dock so add a second dock+berth for gw2
    session.add(Dock(dock_id="d2", harbor_id="h1", name="D2"))
    await session.commit()
    session.add_all(
        [
            Berth(berth_id="b-other", dock_id="d2", status="free"),
            Gateway(gateway_id="gw2", dock_id="d2", name="G2", status="online"),
        ]
    )
    await session.commit()
    session.add(
        _node(
            "n-other",
            "b-other",
            "gw2",
            user_id=harbor_master.user_id,
        )
    )
    await session.commit()
    r = await client.get(
        "/api/nodes?gateway_id=gw2",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert [row["node_id"] for row in r.json()] == ["n-other"]


async def test_get_node_returns_detail_with_events(
    client: AsyncClient, session: AsyncSession, harbor_master: User, fleet
):
    now = datetime.now(UTC)
    session.add_all(
        [
            Event(
                event_id="ev1",
                berth_id="b-online",
                node_id="n-online",
                event_type="occupied",
                sensor_raw=300,
                timestamp=now - timedelta(minutes=2),
            ),
            Event(
                event_id="ev2",
                berth_id="b-online",
                node_id="n-online",
                event_type="freed",
                sensor_raw=900,
                timestamp=now - timedelta(minutes=1),
            ),
        ]
    )
    await session.commit()

    r = await client.get(
        "/api/nodes/n-online",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["node_id"] == "n-online"
    assert body["health"] == "online"
    assert [e["event_id"] for e in body["recent_events"]] == ["ev2", "ev1"]


async def test_get_node_404_unknown(client: AsyncClient, harbor_master: User, fleet):
    r = await client.get(
        "/api/nodes/nope",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 404


async def test_decommission_node_flips_status(
    client: AsyncClient, session: AsyncSession, harbor_master: User, fleet
):
    r = await client.post(
        "/api/nodes/n-online/decommission",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    assert r.json()["health"] == "decommissioned"

    persisted = await session.get(Node, "n-online")
    assert persisted is not None
    await session.refresh(persisted)
    assert persisted.status == "decommissioned"


async def test_decommission_idempotent(client: AsyncClient, harbor_master: User, fleet):
    headers = {"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"}
    first = await client.post("/api/nodes/n-decom/decommission", headers=headers)
    second = await client.post("/api/nodes/n-decom/decommission", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["health"] == "decommissioned"


async def test_decommission_404_unknown(
    client: AsyncClient, harbor_master: User, fleet
):
    r = await client.post(
        "/api/nodes/nope/decommission",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 404


async def test_decommission_rejects_boat_owner(
    client: AsyncClient, boat_owner: User, fleet
):
    r = await client.post(
        "/api/nodes/n-online/decommission",
        headers={"Authorization": f"Bearer {_auth_token(boat_owner.user_id)}"},
    )
    assert r.status_code == 403

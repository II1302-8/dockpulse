from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Berth, Dock, Event, Gateway, Harbor, Node, User
from tests._helpers import auth_cookies as _creds


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
        cookies=_creds(boat_owner.user_id),
    )
    assert r.status_code == 403


async def test_list_nodes_returns_all_with_derived_health(
    client: AsyncClient, harbor_master: User, fleet
):
    r = await client.get(
        "/api/nodes",
        cookies=_creds(harbor_master.user_id),
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
        cookies=_creds(harbor_master.user_id),
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
        cookies=_creds(harbor_master.user_id),
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
                mesh_unicast_addr="0x0042",
                timestamp=now - timedelta(minutes=2),
            ),
            Event(
                event_id="ev2",
                berth_id="b-online",
                node_id="n-online",
                event_type="freed",
                sensor_raw=900,
                mesh_unicast_addr="0x0042",
                timestamp=now - timedelta(minutes=1),
            ),
        ]
    )
    await session.commit()

    r = await client.get(
        "/api/nodes/n-online",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["node_id"] == "n-online"
    assert body["health"] == "online"
    assert [e["event_id"] for e in body["recent_events"]] == ["ev2", "ev1"]


async def test_get_node_404_unknown(client: AsyncClient, harbor_master: User, fleet):
    r = await client.get(
        "/api/nodes/nope",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 404


async def test_decommission_node_flips_status(
    client: AsyncClient, session: AsyncSession, harbor_master: User, fleet
):
    r = await client.post(
        "/api/nodes/n-online/decommission",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    assert r.json()["health"] == "decommissioned"

    persisted = await session.get(Node, "n-online")
    assert persisted is not None
    await session.refresh(persisted)
    assert persisted.status == "decommissioned"


async def test_decommission_idempotent(client: AsyncClient, harbor_master: User, fleet):
    creds = _creds(harbor_master.user_id)
    first = await client.post("/api/nodes/n-decom/decommission", cookies=creds)
    second = await client.post("/api/nodes/n-decom/decommission", cookies=creds)
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["health"] == "decommissioned"


async def test_decommission_publishes_mqtt_once(
    client: AsyncClient,
    harbor_master: User,
    fleet,
    published_decommission_reqs: list[dict],
):
    creds = _creds(harbor_master.user_id)
    await client.post("/api/nodes/n-online/decommission", cookies=creds)
    # second call is a no-op, must not republish
    await client.post("/api/nodes/n-online/decommission", cookies=creds)

    assert len(published_decommission_reqs) == 1
    call = published_decommission_reqs[0]
    assert call["gateway_id"] == "gw1"
    assert call["node_id"] == "n-online"
    assert call["berth_id"] == "b-online"
    assert call["unicast_addr"] == "0x0001"
    assert call["request_id"]


async def test_decommission_already_decommissioned_does_not_publish(
    client: AsyncClient,
    harbor_master: User,
    fleet,
    published_decommission_reqs: list[dict],
):
    r = await client.post(
        "/api/nodes/n-decom/decommission",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    assert published_decommission_reqs == []


async def test_decommission_503_when_mqtt_down_keeps_db(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    fleet,
    monkeypatch,
):
    # broker outage must surface as 503 and leave node provisioned, otherwise
    # db says decommissioned while mesh still routes the unicast addr
    from app.mqtt import MqttNotConnectedError

    async def _raise(**_):
        raise MqttNotConnectedError("broker client down")

    monkeypatch.setattr("app.routers.nodes.publish_decommission_req", _raise)

    r = await client.post(
        "/api/nodes/n-online/decommission",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 503

    persisted = await session.get(Node, "n-online")
    await session.refresh(persisted)
    assert persisted.status == "provisioned"


async def test_decommission_404_unknown(
    client: AsyncClient, harbor_master: User, fleet
):
    r = await client.post(
        "/api/nodes/nope/decommission",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 404


async def test_decommission_rejects_boat_owner(
    client: AsyncClient, boat_owner: User, fleet
):
    r = await client.post(
        "/api/nodes/n-online/decommission",
        cookies=_creds(boat_owner.user_id),
    )
    assert r.status_code == 403


@pytest_asyncio.fixture
async def foreign_node(session: AsyncSession, fleet):
    session.add_all(
        [
            Harbor(harbor_id="h2", name="Other Harbor"),
            Dock(dock_id="d2", harbor_id="h2", name="D2"),
        ]
    )
    await session.commit()
    session.add_all(
        [
            Berth(berth_id="b-foreign", dock_id="d2", status="free"),
            Gateway(gateway_id="gw-foreign", dock_id="d2", name="GF", status="online"),
        ]
    )
    await session.commit()
    session.add(
        _node(
            "n-foreign",
            "b-foreign",
            "gw-foreign",
            user_id="hm1",
            adopted_at=datetime.now(UTC),
        )
    )
    await session.commit()


async def test_list_nodes_excludes_unmanaged_harbor(
    client: AsyncClient, harbor_master: User, foreign_node
):
    r = await client.get(
        "/api/nodes",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    ids = [n["node_id"] for n in r.json()]
    assert "n-foreign" not in ids


async def test_get_foreign_node_returns_403(
    client: AsyncClient, harbor_master: User, foreign_node
):
    r = await client.get(
        "/api/nodes/n-foreign",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 403


async def test_decommission_foreign_node_returns_403(
    client: AsyncClient,
    harbor_master: User,
    foreign_node,
    published_decommission_reqs: list[dict],
):
    r = await client.post(
        "/api/nodes/n-foreign/decommission",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 403
    assert published_decommission_reqs == []

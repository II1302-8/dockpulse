"""node decommission"""

from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


async def test_decommission_unknown_node_returns_404(
    client: AsyncClient, auth_headers, harbor_world
):
    r = await client.post(
        "/api/admin/nodes/no-such-node/decommission", headers=auth_headers
    )
    assert r.status_code == 404


async def _seed_node(session: AsyncSession) -> None:
    from app.models import Node

    session.add(
        Node(
            node_id="n-admin",
            mesh_uuid="n-admin".ljust(32, "0"),
            serial_number="DP-N-admin",
            berth_id="b1",
            gateway_id="gw1",
            mesh_unicast_addr="0x0042",
            dev_key_fp="abc",
            status="provisioned",
            adopted_at=datetime.now(UTC),
        )
    )
    await session.commit()


async def test_admin_decommission_503_when_mqtt_down_keeps_db(
    client: AsyncClient,
    auth_headers,
    harbor_world,
    session: AsyncSession,
    monkeypatch,
):
    from app.models import Node
    from app.mqtt import MqttNotConnectedError

    await _seed_node(session)

    async def _raise(**_):
        raise MqttNotConnectedError("broker client down")

    monkeypatch.setattr("app.routers.admin.nodes.publish_decommission_req", _raise)

    r = await client.post("/api/admin/nodes/n-admin/decommission", headers=auth_headers)
    assert r.status_code == 503

    persisted = await session.get(Node, "n-admin")
    await session.refresh(persisted)
    assert persisted.status == "provisioned"


async def _seed_decommissioned_node(session: AsyncSession) -> None:
    from app.models import Node

    session.add(
        Node(
            node_id="n-stuck",
            mesh_uuid="n-stuck".ljust(32, "0"),
            serial_number="DP-N-stuck",
            berth_id="b1",
            gateway_id="gw1",
            mesh_unicast_addr="0x0099",
            dev_key_fp="abc",
            status="decommissioned",
            adopted_at=datetime.now(UTC),
        )
    )
    await session.commit()


async def test_resend_decommission_publishes(
    client: AsyncClient,
    auth_headers,
    harbor_world,
    session: AsyncSession,
    monkeypatch,
):
    await _seed_decommissioned_node(session)

    captured: list[dict] = []

    async def _capture(**kwargs):
        captured.append(kwargs)

    monkeypatch.setattr("app.routers.admin.nodes.publish_decommission_req", _capture)

    r = await client.post(
        "/api/admin/nodes/n-stuck/decommission/resend", headers=auth_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["node_id"] == "n-stuck"
    assert body["request_id"]

    assert len(captured) == 1
    call = captured[0]
    assert call["gateway_id"] == "gw1"
    assert call["node_id"] == "n-stuck"
    assert call["unicast_addr"] == "0x0099"
    assert call["berth_id"] == "b1"
    assert call["request_id"] == body["request_id"]


async def test_resend_decommission_409_when_not_decommissioned(
    client: AsyncClient,
    auth_headers,
    harbor_world,
    session: AsyncSession,
    monkeypatch,
):
    await _seed_node(session)

    async def _explode(**_):
        raise AssertionError("publish must not be called for live nodes")

    monkeypatch.setattr("app.routers.admin.nodes.publish_decommission_req", _explode)

    r = await client.post(
        "/api/admin/nodes/n-admin/decommission/resend", headers=auth_headers
    )
    assert r.status_code == 409


async def test_resend_decommission_503_when_mqtt_down(
    client: AsyncClient,
    auth_headers,
    harbor_world,
    session: AsyncSession,
    monkeypatch,
):
    from app.mqtt import MqttNotConnectedError

    await _seed_decommissioned_node(session)

    async def _raise(**_):
        raise MqttNotConnectedError("broker client down")

    monkeypatch.setattr("app.routers.admin.nodes.publish_decommission_req", _raise)

    r = await client.post(
        "/api/admin/nodes/n-stuck/decommission/resend", headers=auth_headers
    )
    assert r.status_code == 503


async def test_resend_decommission_404_unknown(
    client: AsyncClient, auth_headers, harbor_world
):
    r = await client.post(
        "/api/admin/nodes/no-such-node/decommission/resend", headers=auth_headers
    )
    assert r.status_code == 404

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
    from app.mqtt import MqttNotConnected

    await _seed_node(session)

    async def _raise(**_):
        raise MqttNotConnected("broker client down")

    monkeypatch.setattr("app.routers.admin.nodes.publish_decommission_req", _raise)

    r = await client.post(
        "/api/admin/nodes/n-admin/decommission", headers=auth_headers
    )
    assert r.status_code == 503

    persisted = await session.get(Node, "n-admin")
    await session.refresh(persisted)
    assert persisted.status == "provisioned"

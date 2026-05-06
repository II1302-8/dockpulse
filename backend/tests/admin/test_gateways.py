"""gateway create / patch / dismiss-pending"""

from httpx import AsyncClient


async def test_create_gateway(client: AsyncClient, auth_headers, harbor_world, session):
    from app.models import Dock

    session.add(Dock(dock_id="d2", harbor_id="h1", name="Dock 2"))
    await session.commit()

    r = await client.post(
        "/api/admin/gateways",
        headers=auth_headers,
        json={"gateway_id": "gw-new", "dock_id": "d2", "name": "New Gateway"},
    )
    assert r.status_code == 201
    assert r.json()["gateway_id"] == "gw-new"


async def test_create_gateway_rejects_unknown_dock(
    client: AsyncClient, auth_headers, harbor_world
):
    r = await client.post(
        "/api/admin/gateways",
        headers=auth_headers,
        json={"gateway_id": "gw-x", "dock_id": "missing", "name": "X"},
    )
    assert r.status_code == 404


async def test_patch_gateway_ttl(client: AsyncClient, auth_headers, harbor_world):
    r = await client.patch(
        "/api/admin/gateways/gw1",
        headers=auth_headers,
        json={"provision_ttl_s": 300},
    )
    assert r.status_code == 200
    assert r.json()["provision_ttl_s"] == 300


async def test_dismiss_pending_gateway(
    client: AsyncClient, auth_headers, harbor_world, session
):
    from app.models import PendingGateway

    session.add(PendingGateway(gateway_id="gw-dismiss", attempts=2))
    await session.commit()

    r = await client.delete(
        "/api/admin/gateways/pending/gw-dismiss", headers=auth_headers
    )
    assert r.status_code == 204

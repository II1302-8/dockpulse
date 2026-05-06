"""Dock CRUD."""

from httpx import AsyncClient


async def test_create_dock(client: AsyncClient, auth_headers, harbor_h1):
    r = await client.post(
        "/api/admin/docks",
        headers=auth_headers,
        json={"dock_id": "d-new", "harbor_id": "h1", "name": "New Dock"},
    )
    assert r.status_code == 201


async def test_delete_dock_blocks_when_berths_or_gw_exist(
    client: AsyncClient, auth_headers, harbor_world
):
    r = await client.delete("/api/admin/docks/d1", headers=auth_headers)
    assert r.status_code == 409

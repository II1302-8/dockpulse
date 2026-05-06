"""Harbor CRUD."""

from httpx import AsyncClient


async def test_create_harbor(client: AsyncClient, auth_headers):
    r = await client.post(
        "/api/admin/harbors",
        headers=auth_headers,
        json={"harbor_id": "h-new", "name": "New Harbor", "lat": 59.3, "lng": 18.1},
    )
    assert r.status_code == 201


async def test_create_harbor_rejects_duplicate(
    client: AsyncClient, auth_headers, harbor_h1
):
    r = await client.post(
        "/api/admin/harbors",
        headers=auth_headers,
        json={"harbor_id": "h1", "name": "Dupe"},
    )
    assert r.status_code == 409


async def test_patch_harbor(client: AsyncClient, auth_headers, harbor_h1):
    r = await client.patch(
        "/api/admin/harbors/h1",
        headers=auth_headers,
        json={"name": "Renamed"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"


async def test_delete_harbor_blocks_when_docks_exist(
    client: AsyncClient, auth_headers, harbor_world
):
    r = await client.delete("/api/admin/harbors/h1", headers=auth_headers)
    assert r.status_code == 409

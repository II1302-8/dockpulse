"""snapshot endpoint + auth gate"""

from httpx import AsyncClient


async def test_snapshot_rejects_missing_header(client: AsyncClient, cf_keys):
    r = await client.get("/api/admin/snapshot")
    assert r.status_code == 401
    assert "Cf-Access-Jwt-Assertion" in r.json()["detail"]


async def test_snapshot_rejects_invalid_token(client: AsyncClient, cf_keys):
    r = await client.get(
        "/api/admin/snapshot",
        headers={"Cf-Access-Jwt-Assertion": "not.a.valid.jwt"},
    )
    assert r.status_code == 401


async def test_snapshot_returns_state(client: AsyncClient, auth_headers, harbor_world):
    r = await client.get("/api/admin/snapshot", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "gateways" in body
    assert "nodes" in body
    assert "pending_gateways" in body
    assert body["adoption"]["pending"] == 0

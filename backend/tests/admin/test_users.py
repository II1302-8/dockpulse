"""User CRUD + harbor grant/revoke."""

from httpx import AsyncClient


async def test_create_harbormaster(client: AsyncClient, auth_headers):
    r = await client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={
            "email": "newhm@harbor.se",
            "password": "supersecret123",
            "firstname": "Harbor",
            "lastname": "Master",
            "role": "harbormaster",
        },
    )
    assert r.status_code == 201
    assert r.json()["role"] == "harbormaster"


async def test_create_user_rejects_duplicate_email(
    client: AsyncClient, auth_headers, harbor_master
):
    r = await client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={
            "email": harbor_master.email,
            "password": "anotherpass1",
            "firstname": "X",
            "lastname": "Y",
        },
    )
    assert r.status_code == 409


async def test_grant_harbor_to_harbormaster(
    client: AsyncClient, auth_headers, harbor_master, harbor_world
):
    r = await client.post(
        f"/api/admin/users/{harbor_master.user_id}/harbor-grants",
        headers=auth_headers,
        json={"harbor_id": "h1"},
    )
    assert r.status_code == 201

    # idempotent — second call no-ops
    r2 = await client.post(
        f"/api/admin/users/{harbor_master.user_id}/harbor-grants",
        headers=auth_headers,
        json={"harbor_id": "h1"},
    )
    assert r2.status_code == 201
    assert r2.json()["noop"] is True


async def test_grant_harbor_rejects_non_harbormaster(
    client: AsyncClient, auth_headers, boat_owner, harbor_h1
):
    r = await client.post(
        f"/api/admin/users/{boat_owner.user_id}/harbor-grants",
        headers=auth_headers,
        json={"harbor_id": "h1"},
    )
    assert r.status_code == 409


async def test_revoke_harbor(
    client: AsyncClient, auth_headers, harbor_master, harbor_world
):
    # harbor_master fixture seeds UserHarborRole(hm1, h1, harbormaster) already
    r = await client.delete(
        f"/api/admin/users/{harbor_master.user_id}/harbor-grants/h1",
        headers=auth_headers,
    )
    assert r.status_code == 204

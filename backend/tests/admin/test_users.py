"""user crud + harbor grant/revoke"""

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from tests._helpers import hash_password


@pytest_asyncio.fixture
async def unverified_user(session: AsyncSession) -> User:
    user = User(
        user_id="o2",
        firstname="Una",
        lastname="Unverified",
        email="una@example.com",
        password_hash=hash_password("secret"),
        email_verified=False,
    )
    session.add(user)
    await session.commit()
    return user


async def test_create_user_starts_as_boat_owner(client: AsyncClient, auth_headers):
    # role derived from user_harbor_roles, no grant yet
    r = await client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={
            "email": "newhm@harbor.se",
            "password": "supersecret123",
            "firstname": "Harbor",
            "lastname": "Master",
        },
    )
    assert r.status_code == 201
    assert r.json()["role"] == "boat_owner"


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

    # second call no-ops
    r2 = await client.post(
        f"/api/admin/users/{harbor_master.user_id}/harbor-grants",
        headers=auth_headers,
        json={"harbor_id": "h1"},
    )
    assert r2.status_code == 201
    assert r2.json()["noop"] is True


async def test_grant_harbor_promotes_boat_owner(
    client: AsyncClient, auth_headers, boat_owner, harbor_h1
):
    # granting any user a harbor role makes them a harbormaster
    r = await client.post(
        f"/api/admin/users/{boat_owner.user_id}/harbor-grants",
        headers=auth_headers,
        json={"harbor_id": "h1"},
    )
    assert r.status_code == 201


async def test_revoke_harbor(
    client: AsyncClient, auth_headers, harbor_master, harbor_world
):
    # harbor_master fixture already seeds UserHarborRole(hm1, h1, harbormaster)
    r = await client.delete(
        f"/api/admin/users/{harbor_master.user_id}/harbor-grants/h1",
        headers=auth_headers,
    )
    assert r.status_code == 204


async def test_verify_email_flips_flag(
    client: AsyncClient, auth_headers, unverified_user, session
):
    assert unverified_user.email_verified is False
    r = await client.post(
        f"/api/admin/users/{unverified_user.user_id}/verify-email",
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["email_verified"] is True
    await session.refresh(unverified_user)
    assert unverified_user.email_verified is True


async def test_verify_email_idempotent(client: AsyncClient, auth_headers, boat_owner):
    # boat_owner fixture seeds email_verified=True
    r = await client.post(
        f"/api/admin/users/{boat_owner.user_id}/verify-email",
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["email_verified"] is True


async def test_verify_email_unknown_user_returns_404(client: AsyncClient, auth_headers):
    r = await client.post(
        "/api/admin/users/does-not-exist/verify-email",
        headers=auth_headers,
    )
    assert r.status_code == 404


async def test_list_users_exposes_email_verified(
    client: AsyncClient, auth_headers, unverified_user, boat_owner
):
    r = await client.get("/api/admin/users", headers=auth_headers)
    assert r.status_code == 200
    rows = {u["user_id"]: u for u in r.json()}
    assert rows[unverified_user.user_id]["email_verified"] is False
    assert rows[boat_owner.user_id]["email_verified"] is True

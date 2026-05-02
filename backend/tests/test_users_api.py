import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from tests._helpers import (
    hash_password as _hash,
)
from tests._helpers import (
    make_auth_token as make_token,
)
from tests._helpers import (
    verify_password,
)


@pytest_asyncio.fixture
async def test_user(session: AsyncSession) -> User:
    user = User(
        user_id="u1",
        firstname="Anna",
        lastname="Svensson",
        email="anna@example.com",
        phone="0701234567",
        password_hash=_hash("secret"),
        boat_club="Göteborgs Segelsällskap",
        token_version=0,
    )
    session.add(user)
    await session.commit()
    return user


async def test_get_me_returns_profile(client: AsyncClient, test_user: User):
    token = make_token(test_user.user_id)
    r = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["user_id"] == "u1"
    assert data["firstname"] == "Anna"
    assert data["lastname"] == "Svensson"
    assert data["email"] == "anna@example.com"
    assert data["phone"] == "0701234567"
    assert data["boat_club"] == "Göteborgs Segelsällskap"
    assert "password_hash" not in data


async def test_get_me_requires_auth(client: AsyncClient):
    r = await client.get("/api/users/me")
    assert r.status_code == 401


async def test_patch_me_updates_fields(client: AsyncClient, test_user: User):
    token = make_token(test_user.user_id)
    r = await client.patch(
        "/api/users/me",
        json={"firstname": "Britta", "boat_club": "GKSS"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["firstname"] == "Britta"
    assert data["boat_club"] == "GKSS"
    assert data["lastname"] == "Svensson"


async def test_patch_me_updates_password(
    client: AsyncClient, test_user: User, session: AsyncSession
):
    token = make_token(test_user.user_id)
    r = await client.patch(
        "/api/users/me",
        json={"password": "newpassword"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    await session.refresh(test_user)
    assert verify_password(test_user.password_hash, "newpassword")


async def test_patch_me_email_conflict(
    client: AsyncClient, test_user: User, session: AsyncSession
):
    other = User(
        user_id="u2",
        firstname="Bo",
        lastname="Berg",
        email="bo@example.com",
        phone=None,
        password_hash=_hash("x"),
        boat_club=None,
    )
    session.add(other)
    await session.commit()

    token = make_token(test_user.user_id)
    r = await client.patch(
        "/api/users/me",
        json={"email": "bo@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 409


async def test_patch_me_requires_auth(client: AsyncClient):
    r = await client.patch("/api/users/me", json={"firstname": "X"})
    assert r.status_code == 401


_REGISTER_PAYLOAD = {
    "firstname": "Cecilia",
    "lastname": "Nilsson",
    "email": "cecilia@example.com",
    "phone": "0707654321",
    "boat_club": "KSSS",
    "password": "hunter2hunter2",
}


async def test_register_creates_user(client: AsyncClient, session: AsyncSession):
    r = await client.post("/api/users", json=_REGISTER_PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "cecilia@example.com"
    assert data["firstname"] == "Cecilia"
    assert "password" not in data
    assert "password_hash" not in data
    assert data["user_id"]

    stored = await session.get(User, data["user_id"])
    assert stored is not None
    assert verify_password(stored.password_hash, "hunter2hunter2")


async def test_register_duplicate_email_conflict(client: AsyncClient, test_user: User):
    payload = {**_REGISTER_PAYLOAD, "email": test_user.email}
    r = await client.post("/api/users", json=payload)
    assert r.status_code == 409


async def test_register_rejects_short_password(client: AsyncClient):
    payload = {**_REGISTER_PAYLOAD, "password": "short"}
    r = await client.post("/api/users", json=payload)
    assert r.status_code == 422


async def test_register_rejects_invalid_email(client: AsyncClient):
    payload = {**_REGISTER_PAYLOAD, "email": "not-an-email"}
    r = await client.post("/api/users", json=payload)
    assert r.status_code == 422


async def test_login_returns_usable_token(client: AsyncClient, test_user: User):
    r = await client.post(
        "/api/users/token",
        json={"email": test_user.email, "password": "secret"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    token = body["access_token"]

    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["user_id"] == test_user.user_id


async def test_login_wrong_password_returns_401(client: AsyncClient, test_user: User):
    r = await client.post(
        "/api/users/token",
        json={"email": test_user.email, "password": "wrong"},
    )
    assert r.status_code == 401


async def test_login_unknown_email_returns_401(client: AsyncClient):
    r = await client.post(
        "/api/users/token",
        json={"email": "nobody@example.com", "password": "secret"},
    )
    assert r.status_code == 401

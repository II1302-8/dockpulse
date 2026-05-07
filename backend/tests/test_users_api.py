import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
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


def _creds(token: str) -> dict[str, str]:
    return {"dockpulse_access": token, "dockpulse_csrf": "test-csrf"}


@pytest_asyncio.fixture
async def test_user(session: AsyncSession) -> User:
    user = User(
        user_id="u1",
        firstname="Anna",
        lastname="Svensson",
        email="anna@example.com",
        phone="0701234567",
        password_hash=_hash("secretpassword"),
        boat_club="Göteborgs Segelsällskap",
        token_version=0,
        email_verified=True,
    )
    session.add(user)
    await session.commit()
    return user


async def test_get_me_returns_profile(client: AsyncClient, test_user: User):
    token = make_token(test_user.user_id)
    r = await client.get("/api/users/me", cookies=_creds(token))
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
        cookies=_creds(token),
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
        json={"password": "newpassword12", "current_password": "secretpassword"},
        cookies=_creds(token),
    )
    assert r.status_code == 200
    await session.refresh(test_user)
    assert verify_password(test_user.password_hash, "newpassword12")


async def test_patch_me_password_requires_current_password(
    client: AsyncClient, test_user: User
):
    token = make_token(test_user.user_id)
    r = await client.patch(
        "/api/users/me",
        json={"password": "newpassword12"},
        cookies=_creds(token),
    )
    assert r.status_code == 422


async def test_patch_me_password_rejects_wrong_current_password(
    client: AsyncClient, test_user: User, session: AsyncSession
):
    token = make_token(test_user.user_id)
    original_hash = test_user.password_hash
    r = await client.patch(
        "/api/users/me",
        json={"password": "newpassword12", "current_password": "wrongpassword"},
        cookies=_creds(token),
    )
    assert r.status_code == 401
    await session.refresh(test_user)
    assert test_user.password_hash == original_hash


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
        cookies=_creds(token),
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


async def test_register_creates_user(client: AsyncClient, session: AsyncSession, monkeypatch):
    async def _noop(**kw): pass
    monkeypatch.setattr("app.routers.auth.send_verification_email", _noop)

    r = await client.post("/api/auth/register", json=_REGISTER_PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert "email" in data["message"].lower()

    stored = (
        await session.execute(
            select(User).where(User.email == "cecilia@example.com")
        )
    ).scalar_one()
    assert stored is not None
    assert stored.email_verified is False
    assert verify_password(stored.password_hash, "hunter2hunter2")


async def test_register_duplicate_email_no_enumeration(client: AsyncClient, test_user: User, monkeypatch):
    async def _noop(**kw): pass
    monkeypatch.setattr("app.routers.auth.send_account_exists_email", _noop)

    payload = {**_REGISTER_PAYLOAD, "email": test_user.email}
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 201


async def test_register_rejects_short_password(client: AsyncClient):
    payload = {**_REGISTER_PAYLOAD, "password": "short"}
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 422


async def test_register_rejects_invalid_email(client: AsyncClient):
    payload = {**_REGISTER_PAYLOAD, "email": "not-an-email"}
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 422


async def test_register_accepts_unicode_names(client: AsyncClient, monkeypatch):
    async def _noop(**kw): pass
    monkeypatch.setattr("app.routers.auth.send_verification_email", _noop)

    payload = {
        **_REGISTER_PAYLOAD,
        "email": "dog@example.com",
        "firstname": "Dögg",
        "lastname": "Not Ä'Dog",
    }
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 201


async def test_register_rejects_digits_in_name(client: AsyncClient):
    payload = {**_REGISTER_PAYLOAD, "firstname": "Anna1"}
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 422


async def test_register_rejects_phone_without_digits(client: AsyncClient):
    payload = {**_REGISTER_PAYLOAD, "phone": "()()()()()()()"}
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 422


async def test_register_rejects_overlong_name(client: AsyncClient):
    payload = {**_REGISTER_PAYLOAD, "firstname": "A" * 101}
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 422


async def test_register_rejects_overlong_password(client: AsyncClient):
    payload = {**_REGISTER_PAYLOAD, "password": "a" * 129}
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 422


async def test_login_returns_user_and_session_works(
    client: AsyncClient, test_user: User
):
    r = await client.post(
        "/api/auth/login",
        json={"email": test_user.email, "password": "secretpassword"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == test_user.user_id
    assert body["email"] == test_user.email
    assert "password_hash" not in body

    me = await client.get("/api/users/me")
    assert me.status_code == 200
    assert me.json()["user_id"] == test_user.user_id


async def test_login_wrong_password_returns_401(client: AsyncClient, test_user: User):
    r = await client.post(
        "/api/auth/login",
        json={"email": test_user.email, "password": "wrongpassword"},
    )
    assert r.status_code == 401


async def test_login_unknown_email_returns_401(client: AsyncClient):
    r = await client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "secretpassword"},
    )
    assert r.status_code == 401


async def test_logout_returns_204(client: AsyncClient, test_user: User):
    token = make_token(test_user.user_id)
    r = await client.post("/api/auth/logout", cookies=_creds(token))
    assert r.status_code == 204


async def test_logout_invalidates_token(client: AsyncClient, test_user: User):
    token = make_token(test_user.user_id)
    await client.post("/api/auth/logout", cookies=_creds(token))
    r = await client.get("/api/users/me", cookies=_creds(token))
    assert r.status_code == 401


async def test_logout_requires_auth(client: AsyncClient):
    r = await client.post("/api/auth/logout")
    assert r.status_code == 401


async def test_get_notification_prefs_returns_defaults(
    client: AsyncClient, test_user: User
):
    token = make_token(test_user.user_id)
    r = await client.get("/api/users/me/notification-prefs", cookies=_creds(token))
    assert r.status_code == 200
    data = r.json()
    assert data["notify_arrival"] is True
    assert data["notify_departure"] is True


async def test_patch_notification_prefs_updates_fields(
    client: AsyncClient, test_user: User
):
    token = make_token(test_user.user_id)
    r = await client.patch(
        "/api/users/me/notification-prefs",
        json={"notify_arrival": False},
        cookies=_creds(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["notify_arrival"] is False
    assert data["notify_departure"] is True


async def test_notification_prefs_requires_auth(client: AsyncClient):
    r = await client.get("/api/users/me/notification-prefs")
    assert r.status_code == 401

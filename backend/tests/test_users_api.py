import os

import jwt
import pytest_asyncio
from argon2 import PasswordHasher
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User

SECRET_KEY = os.environ.get("SECRET_KEY", "test-secret")
ALGORITHM = "HS256"


def make_token(user_id: str, token_version: int = 0) -> str:
    return jwt.encode(
        {"sub": user_id, "ver": token_version}, SECRET_KEY, algorithm=ALGORITHM
    )


_ph = PasswordHasher()


def _hash(password: str) -> str:
    return _ph.hash(password)


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
    assert _ph.verify(test_user.password_hash, "newpassword")


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

from datetime import UTC, datetime, timedelta

import jwt
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    ACCESS_COOKIE,
    ALGORITHM,
    CSRF_COOKIE,
    REFRESH_COOKIE,
)
from app.config import get_settings
from app.models import RefreshToken, User
from tests._helpers import hash_password


async def _register_user(session: AsyncSession) -> User:
    user = User(
        user_id="u-cookie",
        firstname="Cora",
        lastname="Cookie",
        email="cora@example.com",
        password_hash=hash_password("supersecret"),
        role="boat_owner",
        email_verified=True,
    )
    session.add(user)
    await session.commit()
    return user


async def test_login_sets_session_cookies(client: AsyncClient, session: AsyncSession):
    await _register_user(session)
    r = await client.post(
        "/api/auth/login",
        json={"email": "cora@example.com", "password": "supersecret"},
    )
    assert r.status_code == 200
    assert ACCESS_COOKIE in r.cookies
    assert REFRESH_COOKIE in r.cookies
    assert CSRF_COOKIE in r.cookies
    assert r.cookies[CSRF_COOKIE]


async def test_login_persists_refresh_token_row(
    client: AsyncClient, session: AsyncSession
):
    await _register_user(session)
    await client.post(
        "/api/auth/login",
        json={"email": "cora@example.com", "password": "supersecret"},
    )
    rows = (await session.execute(select(RefreshToken))).scalars().all()
    assert len(rows) == 1
    assert rows[0].user_id == "u-cookie"
    assert rows[0].revoked_at is None


async def test_me_works_with_cookie_only(client: AsyncClient, session: AsyncSession):
    await _register_user(session)
    await client.post(
        "/api/auth/login",
        json={"email": "cora@example.com", "password": "supersecret"},
    )
    r = await client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "cora@example.com"


async def test_refresh_rotates_cookies_and_revokes_old_jti(
    client: AsyncClient, session: AsyncSession
):
    await _register_user(session)
    await client.post(
        "/api/auth/login",
        json={"email": "cora@example.com", "password": "supersecret"},
    )
    old_refresh = client.cookies[REFRESH_COOKIE]

    r = await client.post("/api/auth/refresh")
    assert r.status_code == 204

    new_refresh = client.cookies[REFRESH_COOKIE]
    assert new_refresh != old_refresh

    rows = (
        (await session.execute(select(RefreshToken).order_by(RefreshToken.issued_at)))
        .scalars()
        .all()
    )
    assert len(rows) == 2
    assert rows[0].revoked_at is not None
    assert rows[1].revoked_at is None
    assert rows[0].replaced_by_jti == rows[1].jti


async def test_refresh_reuse_burns_family_and_bumps_token_version(
    client: AsyncClient, session: AsyncSession
):
    user = await _register_user(session)
    starting_version = user.token_version
    await client.post(
        "/api/auth/login",
        json={"email": "cora@example.com", "password": "supersecret"},
    )
    leaked_refresh = client.cookies[REFRESH_COOKIE]

    # legitimate rotation
    await client.post("/api/auth/refresh")

    # attacker replays the leaked refresh on a fresh client
    attacker = AsyncClient(transport=client._transport, base_url=client.base_url)
    attacker.cookies.set(REFRESH_COOKIE, leaked_refresh)
    r = await attacker.post("/api/auth/refresh")
    await attacker.aclose()
    assert r.status_code == 401

    await session.refresh(user)
    assert user.token_version == starting_version + 1
    rows = (await session.execute(select(RefreshToken))).scalars().all()
    assert all(row.revoked_at is not None for row in rows)


async def test_refresh_with_expired_token_returns_401(
    client: AsyncClient, session: AsyncSession
):
    user = await _register_user(session)
    settings = get_settings()
    expired_jti = "expired-jti"
    session.add(
        RefreshToken(
            jti=expired_jti,
            user_id=user.user_id,
            issued_at=datetime.now(UTC) - timedelta(days=30),
            expires_at=datetime.now(UTC) - timedelta(days=1),
        )
    )
    await session.commit()
    expired_jwt = jwt.encode(
        {
            "sub": user.user_id,
            "jti": expired_jti,
            "exp": datetime.now(UTC) + timedelta(days=1),
            "type": "refresh",
        },
        settings.secret_key,
        algorithm=ALGORITHM,
    )
    client.cookies.set(REFRESH_COOKIE, expired_jwt)
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 401


async def test_refresh_without_cookie_returns_401(client: AsyncClient):
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 401


async def test_state_changing_request_without_csrf_header_is_rejected(
    client: AsyncClient, session: AsyncSession
):
    await _register_user(session)
    await client.post(
        "/api/auth/login",
        json={"email": "cora@example.com", "password": "supersecret"},
    )
    # bypass the conftest event-hook that would echo the cookie
    raw = await client.post(
        "/api/auth/refresh",
        headers={"X-CSRF-Token": "wrong-value"},
    )
    assert raw.status_code == 403
    assert raw.json()["detail"] == "CSRF token mismatch"


async def test_csrf_skipped_on_login_when_no_cookie(
    client: AsyncClient, session: AsyncSession
):
    await _register_user(session)
    # first login has no csrf cookie yet, dep must skip rather than reject
    r = await client.post(
        "/api/auth/login",
        json={"email": "cora@example.com", "password": "supersecret"},
    )
    assert r.status_code == 200


async def test_logout_clears_cookies_and_revokes_refresh(
    client: AsyncClient, session: AsyncSession
):
    await _register_user(session)
    await client.post(
        "/api/auth/login",
        json={"email": "cora@example.com", "password": "supersecret"},
    )
    r = await client.post("/api/auth/logout")
    assert r.status_code == 204

    # cleared cookies leave empty values in the jar
    assert client.cookies.get(ACCESS_COOKIE, "") == ""
    rows = (await session.execute(select(RefreshToken))).scalars().all()
    assert all(row.revoked_at is not None for row in rows)

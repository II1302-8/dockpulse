import pytest
import pytest_asyncio
from datetime import UTC, datetime, timedelta

import jwt
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import ALGORITHM
from app.config import get_settings
from app.models import User
# auth_cookies and verify_password used by /resetpassword tests (added in next task)
from tests._helpers import auth_cookies, hash_password, verify_password


@pytest_asyncio.fixture
async def reset_user(session: AsyncSession) -> User:
    user = User(
        user_id="reset-u1",
        firstname="Reset",
        lastname="User",
        email="reset@example.com",
        password_hash=hash_password("oldpassword1234"),
        token_version=0,
    )
    session.add(user)
    await session.commit()
    return user


# used by /resetpassword tests added in the next task
def _make_reset_token(
    user: User,
    *,
    expired: bool = False,
    wrong_type: bool = False,
    wrong_email: bool = False,
) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "type": "wrong_type" if wrong_type else "password_reset",
            "sub": user.user_id,
            "email": "other@example.com" if wrong_email else user.email,
            "iat": now,
            "exp": (now - timedelta(hours=2)) if expired else (now + timedelta(hours=1)),
        },
        get_settings().secret_key,
        algorithm=ALGORITHM,
    )


@pytest.fixture
def captured_emails(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    async def _fake(to, subject, html, idempotency_key=None):
        calls.append({"to": to, "subject": subject, "html": html})

    monkeypatch.setattr("app.notifications.send_email", _fake)
    return calls


# --- /reset ---

async def test_reset_unknown_email_returns_204_no_email(
    client: AsyncClient, captured_emails: list
):
    r = await client.post("/api/users/reset", json={"email": "nobody@example.com"})
    assert r.status_code == 204
    assert captured_emails == []


async def test_reset_known_email_returns_204_and_sends_email(
    client: AsyncClient, reset_user: User, captured_emails: list
):
    r = await client.post("/api/users/reset", json={"email": reset_user.email})
    assert r.status_code == 204
    assert len(captured_emails) == 1
    assert captured_emails[0]["to"] == reset_user.email


async def test_reset_email_contains_reset_url(
    client: AsyncClient, reset_user: User, captured_emails: list
):
    await client.post("/api/users/reset", json={"email": reset_user.email})
    assert "/resetpassword/" in captured_emails[0]["html"]


# --- /resetpassword ---

async def test_confirm_reset_updates_password_and_returns_200(
    client: AsyncClient, reset_user: User, session: AsyncSession
):
    token = _make_reset_token(reset_user)
    r = await client.post(
        "/api/users/resetpassword",
        json={"token": token, "password": "newpassword5678"},
    )
    assert r.status_code == 200
    assert r.json()["message"] == "Password reset successful"
    await session.refresh(reset_user)
    assert verify_password(reset_user.password_hash, "newpassword5678")


async def test_confirm_reset_bumps_token_version(
    client: AsyncClient, reset_user: User, session: AsyncSession
):
    old_ver = reset_user.token_version
    token = _make_reset_token(reset_user)
    await client.post(
        "/api/users/resetpassword",
        json={"token": token, "password": "newpassword5678"},
    )
    await session.refresh(reset_user)
    assert reset_user.token_version == old_ver + 1


async def test_confirm_reset_invalidates_old_session(
    client: AsyncClient, reset_user: User
):
    # auth_cookies builds a cookie dict with the current token_version (0)
    old_cookies = auth_cookies(reset_user.user_id, token_version=0)
    token = _make_reset_token(reset_user)
    await client.post(
        "/api/users/resetpassword",
        json={"token": token, "password": "newpassword5678"},
    )
    # token_version is now 1. old cookie with ver=0 must be rejected
    r = await client.get("/api/users/me", cookies=old_cookies)
    assert r.status_code == 401


async def test_confirm_reset_expired_token_returns_403(
    client: AsyncClient, reset_user: User
):
    token = _make_reset_token(reset_user, expired=True)
    r = await client.post(
        "/api/users/resetpassword",
        json={"token": token, "password": "newpassword5678"},
    )
    assert r.status_code == 403


async def test_confirm_reset_wrong_type_returns_403(
    client: AsyncClient, reset_user: User
):
    token = _make_reset_token(reset_user, wrong_type=True)
    r = await client.post(
        "/api/users/resetpassword",
        json={"token": token, "password": "newpassword5678"},
    )
    assert r.status_code == 403


async def test_confirm_reset_tampered_token_returns_403(
    client: AsyncClient, reset_user: User
):
    r = await client.post(
        "/api/users/resetpassword",
        json={"token": "totally.invalid.jwt", "password": "newpassword5678"},
    )
    assert r.status_code == 403


async def test_confirm_reset_email_mismatch_returns_403(
    client: AsyncClient, reset_user: User
):
    token = _make_reset_token(reset_user, wrong_email=True)
    r = await client.post(
        "/api/users/resetpassword",
        json={"token": token, "password": "newpassword5678"},
    )
    assert r.status_code == 403


async def test_confirm_reset_invite_token_echoed(
    client: AsyncClient, reset_user: User
):
    token = _make_reset_token(reset_user)
    r = await client.post(
        "/api/users/resetpassword",
        json={
            "token": token,
            "password": "newpassword5678",
            "invite_token": "berth-invite-xyz",
        },
    )
    assert r.status_code == 200
    assert r.json()["invite_token"] == "berth-invite-xyz"


async def test_confirm_reset_no_invite_token_is_null(
    client: AsyncClient, reset_user: User
):
    token = _make_reset_token(reset_user)
    r = await client.post(
        "/api/users/resetpassword",
        json={"token": token, "password": "newpassword5678"},
    )
    assert r.status_code == 200
    assert r.json()["invite_token"] is None

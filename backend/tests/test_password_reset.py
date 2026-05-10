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

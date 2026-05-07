from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import ACCESS_COOKIE, REFRESH_COOKIE
from app.models import User, UserVerification

# ── helpers ──────────────────────────────────────────────────────────────────

_REG = {
    "firstname": "Alice",
    "lastname": "Smith",
    "email": "alice@example.com",
    "password": "correcthorsebatterystaple",
}


async def _register(
    client: AsyncClient,
    monkeypatch,
    email: str = "alice@example.com",
) -> list:
    sent: list = []

    async def _capture(**kw):
        sent.append(kw)

    monkeypatch.setattr("app.routers.auth.send_verification_email", _capture)
    monkeypatch.setattr("app.routers.auth.send_account_exists_email", _capture)
    await client.post("/api/auth/register", json={**_REG, "email": email})
    return sent


# ── register ─────────────────────────────────────────────────────────────────


async def test_register_returns_201_with_message(client: AsyncClient, monkeypatch):
    async def _noop(**kw):
        pass

    monkeypatch.setattr("app.routers.auth.send_verification_email", _noop)

    r = await client.post("/api/auth/register", json=_REG)
    assert r.status_code == 201
    assert "email" in r.json()["message"].lower()


async def test_register_does_not_issue_session_cookies(
    client: AsyncClient, monkeypatch
):
    async def _noop(**kw):
        pass

    monkeypatch.setattr("app.routers.auth.send_verification_email", _noop)

    r = await client.post("/api/auth/register", json=_REG)
    assert ACCESS_COOKIE not in r.cookies
    assert REFRESH_COOKIE not in r.cookies


async def test_register_user_is_unverified(
    client: AsyncClient, session: AsyncSession, monkeypatch
):
    async def _noop(**kw):
        pass

    monkeypatch.setattr("app.routers.auth.send_verification_email", _noop)

    await client.post("/api/auth/register", json=_REG)
    user = (
        await session.execute(select(User).where(User.email == "alice@example.com"))
    ).scalar_one()
    assert user.email_verified is False


async def test_register_creates_verification_token(
    client: AsyncClient, session: AsyncSession, monkeypatch
):
    async def _noop(**kw):
        pass

    monkeypatch.setattr("app.routers.auth.send_verification_email", _noop)

    await client.post("/api/auth/register", json=_REG)
    user = (
        await session.execute(select(User).where(User.email == "alice@example.com"))
    ).scalar_one()
    tokens = (
        await session.execute(
            select(UserVerification).where(UserVerification.user_id == user.user_id)
        )
    ).scalars().all()
    assert len(tokens) == 1
    assert tokens[0].used is False


async def test_register_fires_verification_email(
    client: AsyncClient, monkeypatch
):
    sent: list[dict] = []

    async def _capture(**kw):
        sent.append(kw)

    monkeypatch.setattr("app.routers.auth.send_verification_email", _capture)
    await client.post("/api/auth/register", json=_REG)
    assert len(sent) == 1
    assert sent[0]["email"] == "alice@example.com"
    assert sent[0]["firstname"] == "Alice"
    assert len(sent[0]["token"]) > 10


async def test_register_duplicate_unverified_resends_token(
    client: AsyncClient, session: AsyncSession, monkeypatch
):
    sent: list[dict] = []

    async def _capture(**kw):
        sent.append(kw)

    monkeypatch.setattr("app.routers.auth.send_verification_email", _capture)
    monkeypatch.setattr("app.routers.auth.send_account_exists_email", _capture)

    await client.post("/api/auth/register", json=_REG)
    r2 = await client.post("/api/auth/register", json=_REG)

    assert r2.status_code == 201
    assert len(sent) == 2
    # second send should have a different token (old one invalidated)
    assert sent[0]["token"] != sent[1]["token"]

    # verify old token is invalidated and new one is active
    user = (
        await session.execute(select(User).where(User.email == "alice@example.com"))
    ).scalar_one()
    all_tokens = (
        await session.execute(
            select(UserVerification).where(UserVerification.user_id == user.user_id)
        )
    ).scalars().all()
    used_tokens = [t for t in all_tokens if t.used]
    active_tokens = [t for t in all_tokens if not t.used]
    assert len(used_tokens) == 1
    assert len(active_tokens) == 1


async def test_register_duplicate_verified_sends_account_exists(
    client: AsyncClient, session: AsyncSession, monkeypatch
):
    account_exists_sent: list[dict] = []

    async def _noop(**kw):
        pass

    async def _capture_exists(**kw):
        account_exists_sent.append(kw)

    monkeypatch.setattr("app.routers.auth.send_verification_email", _noop)
    monkeypatch.setattr("app.routers.auth.send_account_exists_email", _capture_exists)

    # create verified user directly
    from tests._helpers import hash_password

    user = User(
        user_id="verified-1",
        firstname="Alice",
        lastname="Smith",
        email="alice@example.com",
        password_hash=hash_password("correcthorsebatterystaple"),
        email_verified=True,
    )
    session.add(user)
    await session.commit()

    r = await client.post("/api/auth/register", json=_REG)
    assert r.status_code == 201
    assert len(account_exists_sent) == 1
    assert account_exists_sent[0]["email"] == "alice@example.com"

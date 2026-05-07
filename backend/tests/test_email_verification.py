from datetime import UTC, datetime, timedelta

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
        (
            await session.execute(
                select(UserVerification).where(UserVerification.user_id == user.user_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(tokens) == 1
    assert tokens[0].used is False


async def test_register_fires_verification_email(client: AsyncClient, monkeypatch):
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
        (
            await session.execute(
                select(UserVerification).where(UserVerification.user_id == user.user_id)
            )
        )
        .scalars()
        .all()
    )
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


async def test_register_duplicate_unverified_does_not_update_password(
    client: AsyncClient, session: AsyncSession, monkeypatch
):
    async def _noop(**kw):
        pass

    monkeypatch.setattr("app.routers.auth.send_verification_email", _noop)

    from argon2.exceptions import VerifyMismatchError

    from app.routers.auth import _ph

    await client.post("/api/auth/register", json=_REG)
    new_pw = "differentpassword1"
    await client.post("/api/auth/register", json={**_REG, "password": new_pw})

    user = (
        await session.execute(select(User).where(User.email == "alice@example.com"))
    ).scalar_one()
    try:
        _ph.verify(user.password_hash, new_pw)
        raise AssertionError("password should not have been updated")
    except VerifyMismatchError:
        pass


# ── verify-email ─────────────────────────────────────────────────────────────


async def _create_unverified_user_with_token(
    session: AsyncSession,
    user_id: str = "u-verify",
    email: str = "verify@example.com",
) -> tuple[User, str]:
    from tests._helpers import hash_password

    user = User(
        user_id=user_id,
        firstname="Vera",
        lastname="Verify",
        email=email,
        password_hash=hash_password("password1234"),
        email_verified=False,
    )
    session.add(user)
    await session.flush()
    token_value = "test-token-abc123"
    session.add(
        UserVerification(
            user_id=user_id,
            token=token_value,
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
    )
    await session.commit()
    return user, token_value


async def test_verify_email_marks_user_verified(
    client: AsyncClient, session: AsyncSession
):
    user, token = await _create_unverified_user_with_token(session)
    r = await client.get(f"/api/auth/verify-email?token={token}")
    assert r.status_code == 200
    assert "verified" in r.json()["message"].lower()
    await session.refresh(user)
    assert user.email_verified is True


async def test_verify_email_marks_token_used(
    client: AsyncClient, session: AsyncSession
):
    user, token = await _create_unverified_user_with_token(session)
    await client.get(f"/api/auth/verify-email?token={token}")
    record = (
        await session.execute(
            select(UserVerification).where(UserVerification.token == token)
        )
    ).scalar_one()
    assert record.used is True


async def test_verify_email_unknown_token_returns_400(client: AsyncClient):
    r = await client.get("/api/auth/verify-email?token=nonexistent")
    assert r.status_code == 400


async def test_verify_email_used_token_returns_400(
    client: AsyncClient, session: AsyncSession
):
    user, token = await _create_unverified_user_with_token(session)
    await client.get(f"/api/auth/verify-email?token={token}")
    r = await client.get(f"/api/auth/verify-email?token={token}")
    assert r.status_code == 400


async def test_verify_email_expired_token_returns_400(
    client: AsyncClient, session: AsyncSession
):
    from tests._helpers import hash_password

    user = User(
        user_id="u-expired",
        firstname="Expo",
        lastname="Red",
        email="expired@example.com",
        password_hash=hash_password("password1234"),
        email_verified=False,
    )
    session.add(user)
    await session.flush()
    session.add(
        UserVerification(
            user_id="u-expired",
            token="expired-token",
            expires_at=datetime.now(UTC) - timedelta(hours=1),
        )
    )
    await session.commit()
    r = await client.get("/api/auth/verify-email?token=expired-token")
    assert r.status_code == 400


# ── resend-verification ───────────────────────────────────────────────────────


async def test_resend_returns_200_for_unverified(
    client: AsyncClient, session: AsyncSession, monkeypatch
):
    sent: list[dict] = []

    async def _capture(**kw):
        sent.append(kw)

    monkeypatch.setattr("app.routers.auth.send_verification_email", _capture)
    await _create_unverified_user_with_token(session)
    r = await client.post(
        "/api/auth/resend-verification", json={"email": "verify@example.com"}
    )
    assert r.status_code == 200
    assert "link" in r.json()["message"].lower()
    assert len(sent) == 1


async def test_resend_invalidates_old_token(
    client: AsyncClient, session: AsyncSession, monkeypatch
):
    async def _noop(**kw):
        pass

    monkeypatch.setattr("app.routers.auth.send_verification_email", _noop)

    user, old_token = await _create_unverified_user_with_token(session)
    await client.post(
        "/api/auth/resend-verification", json={"email": "verify@example.com"}
    )
    old = (
        await session.execute(
            select(UserVerification).where(UserVerification.token == old_token)
        )
    ).scalar_one()
    assert old.used is True


async def test_resend_returns_200_for_unknown_email(client: AsyncClient):
    r = await client.post(
        "/api/auth/resend-verification", json={"email": "nobody@example.com"}
    )
    assert r.status_code == 200


async def test_resend_returns_200_for_already_verified(
    client: AsyncClient, session: AsyncSession
):
    from tests._helpers import hash_password

    user = User(
        user_id="u-already-verified",
        firstname="Vera",
        lastname="Done",
        email="done@example.com",
        password_hash=hash_password("password1234"),
        email_verified=True,
    )
    session.add(user)
    await session.commit()
    r = await client.post(
        "/api/auth/resend-verification", json={"email": "done@example.com"}
    )
    assert r.status_code == 200


# ── login gate ────────────────────────────────────────────────────────────────


async def test_login_blocked_for_unverified_user(
    client: AsyncClient, session: AsyncSession
):
    from tests._helpers import hash_password

    user = User(
        user_id="u-unverified-login",
        firstname="Unver",
        lastname="Ified",
        email="unverified@example.com",
        password_hash=hash_password("password1234"),
        email_verified=False,
    )
    session.add(user)
    await session.commit()
    r = await client.post(
        "/api/auth/login",
        json={"email": "unverified@example.com", "password": "password1234"},
    )
    assert r.status_code == 403
    assert "verified" in r.json()["detail"].lower()


async def test_login_succeeds_for_verified_user(
    client: AsyncClient, session: AsyncSession
):
    from tests._helpers import hash_password

    user = User(
        user_id="u-verified-login",
        firstname="Ver",
        lastname="Ified",
        email="verified-login@example.com",
        password_hash=hash_password("password1234"),
        email_verified=True,
    )
    session.add(user)
    await session.commit()
    r = await client.post(
        "/api/auth/login",
        json={"email": "verified-login@example.com", "password": "password1234"},
    )
    assert r.status_code == 200


async def test_login_wrong_password_still_401_not_403(
    client: AsyncClient, session: AsyncSession
):
    from tests._helpers import hash_password

    user = User(
        user_id="u-wrong-pw",
        firstname="Wrong",
        lastname="Pass",
        email="wrongpass@example.com",
        password_hash=hash_password("correctpassword1234"),
        email_verified=False,
    )
    session.add(user)
    await session.commit()
    r = await client.post(
        "/api/auth/login",
        json={"email": "wrongpass@example.com", "password": "wrongpassword"},
    )
    assert r.status_code == 401

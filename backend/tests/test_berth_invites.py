import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import Assignment, BerthInvite, User
from tests._helpers import auth_cookies


@pytest.fixture
def captured_emails(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    async def _fake(to, subject, html, **_kwargs):
        calls.append({"to": to, "subject": subject, "html": html})

    monkeypatch.setattr("app.notifications.send_email", _fake)
    return calls


def _hm_cookies(hm: User) -> dict[str, str]:
    return auth_cookies(hm.user_id, token_version=hm.token_version)


async def _create_invite(
    client: AsyncClient,
    hm: User,
    *,
    harbor_id="h1",
    berth_id="b1",
    email="inv@example.com",
):
    return await client.post(
        f"/api/harbors/{harbor_id}/berth-invites",
        json={"berth_id": berth_id, "email": email},
        cookies=_hm_cookies(hm),
    )


# --- create ---


async def test_create_invite_persists_row_and_returns_201(
    client: AsyncClient, seeded_berth, harbor_master, captured_emails, session
):
    r = await _create_invite(client, harbor_master)
    assert r.status_code == 201
    body = r.json()
    assert body["berth_id"] == "b1"
    assert body["harbor_id"] == "h1"
    assert body["status"] == "pending"
    rows = (await session.execute(select(BerthInvite))).scalars().all()
    assert len(rows) == 1
    assert len(captured_emails) == 1
    assert "/accept?token=" in captured_emails[0]["html"]


async def test_create_invite_requires_harbormaster(
    client: AsyncClient, seeded_berth, boat_owner
):
    r = await client.post(
        "/api/harbors/h1/berth-invites",
        json={"berth_id": "b1", "email": "x@example.com"},
        cookies=auth_cookies(boat_owner.user_id),
    )
    assert r.status_code == 403


async def test_create_invite_rejects_unauthenticated(client: AsyncClient, seeded_berth):
    r = await client.post(
        "/api/harbors/h1/berth-invites",
        json={"berth_id": "b1", "email": "x@example.com"},
    )
    assert r.status_code == 401


async def test_create_duplicate_pending_returns_409(
    client: AsyncClient, seeded_berth, harbor_master, captured_emails
):
    r1 = await _create_invite(client, harbor_master)
    assert r1.status_code == 201
    r2 = await _create_invite(client, harbor_master, email="other@example.com")
    assert r2.status_code == 409


# --- by-token GET ---


async def test_get_by_token_returns_invite(
    client: AsyncClient, seeded_berth, harbor_master, captured_emails
):
    await _create_invite(client, harbor_master)
    token = captured_emails[0]["html"].split("/accept?token=")[1].split('"')[0]
    r = await client.get(f"/api/berth-invites/by-token/{token}")
    assert r.status_code == 200
    assert r.json()["status"] == "pending"


async def test_get_by_token_unknown_returns_404(client: AsyncClient):
    r = await client.get("/api/berth-invites/by-token/bogus")
    assert r.status_code == 404


async def test_get_by_token_expired_returns_410(
    client: AsyncClient, seeded_berth, harbor_master, captured_emails, session
):
    await _create_invite(client, harbor_master)
    token = captured_emails[0]["html"].split("/accept?token=")[1].split('"')[0]
    invite = (await session.execute(select(BerthInvite))).scalar_one()
    invite.expires_at = datetime.now(UTC) - timedelta(hours=1)
    await session.commit()
    r = await client.get(f"/api/berth-invites/by-token/{token}")
    assert r.status_code == 410


# --- accept ---


async def test_accept_creates_assignment_and_marks_accepted(
    client: AsyncClient,
    seeded_berth,
    harbor_master,
    boat_owner,
    captured_emails,
    session,
):
    await _create_invite(client, harbor_master, email=boat_owner.email)
    token = captured_emails[0]["html"].split("/accept?token=")[1].split('"')[0]
    r = await client.post(
        f"/api/berth-invites/by-token/{token}/accept",
        cookies=auth_cookies(boat_owner.user_id),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"
    assignment = (
        await session.execute(select(Assignment).where(Assignment.berth_id == "b1"))
    ).scalar_one()
    assert assignment.user_id == boat_owner.user_id


async def test_accept_replaces_existing_assignment(
    client: AsyncClient,
    seeded_berth,
    harbor_master,
    boat_owner,
    captured_emails,
    session,
):
    # seed a pre-existing assignment with a different user
    other = User(
        user_id="o2",
        firstname="Other",
        lastname="Owner",
        email="other@example.com",
        password_hash="x",
    )
    session.add(other)
    session.add(Assignment(berth_id="b1", user_id="o2"))
    await session.commit()

    await _create_invite(client, harbor_master, email=boat_owner.email)
    token = captured_emails[0]["html"].split("/accept?token=")[1].split('"')[0]
    r = await client.post(
        f"/api/berth-invites/by-token/{token}/accept",
        cookies=auth_cookies(boat_owner.user_id),
    )
    assert r.status_code == 200
    assignment = (
        await session.execute(select(Assignment).where(Assignment.berth_id == "b1"))
    ).scalar_one()
    assert assignment.user_id == boat_owner.user_id


async def test_accept_wrong_email_returns_403_keeps_pending(
    client: AsyncClient,
    seeded_berth,
    harbor_master,
    boat_owner,
    captured_emails,
    session,
):
    await _create_invite(client, harbor_master, email="someone-else@example.com")
    token = captured_emails[0]["html"].split("/accept?token=")[1].split('"')[0]
    r = await client.post(
        f"/api/berth-invites/by-token/{token}/accept",
        cookies=auth_cookies(boat_owner.user_id),
    )
    assert r.status_code == 403
    invite = (await session.execute(select(BerthInvite))).scalar_one()
    assert invite.status == "pending"


async def test_accept_expired_returns_410(
    client: AsyncClient,
    seeded_berth,
    harbor_master,
    boat_owner,
    captured_emails,
    session,
):
    await _create_invite(client, harbor_master, email=boat_owner.email)
    token = captured_emails[0]["html"].split("/accept?token=")[1].split('"')[0]
    invite = (await session.execute(select(BerthInvite))).scalar_one()
    invite.expires_at = datetime.now(UTC) - timedelta(hours=1)
    await session.commit()
    r = await client.post(
        f"/api/berth-invites/by-token/{token}/accept",
        cookies=auth_cookies(boat_owner.user_id),
    )
    assert r.status_code == 410


async def test_accept_concurrent_only_one_wins(
    client: AsyncClient,
    seeded_berth,
    harbor_master,
    boat_owner,
    captured_emails,
    session,
):
    await _create_invite(client, harbor_master, email=boat_owner.email)
    token = captured_emails[0]["html"].split("/accept?token=")[1].split('"')[0]
    cookies = auth_cookies(boat_owner.user_id)
    r1, r2 = await asyncio.gather(
        client.post(f"/api/berth-invites/by-token/{token}/accept", cookies=cookies),
        client.post(f"/api/berth-invites/by-token/{token}/accept", cookies=cookies),
    )
    codes = sorted([r1.status_code, r2.status_code])
    assert codes == [200, 410]


# --- reject ---


async def test_reject_marks_rejected_no_assignment(
    client: AsyncClient,
    seeded_berth,
    harbor_master,
    boat_owner,
    captured_emails,
    session,
):
    await _create_invite(client, harbor_master, email=boat_owner.email)
    token = captured_emails[0]["html"].split("/accept?token=")[1].split('"')[0]
    r = await client.post(
        f"/api/berth-invites/by-token/{token}/reject",
        cookies=auth_cookies(boat_owner.user_id),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"
    assignment = (
        await session.execute(select(Assignment).where(Assignment.berth_id == "b1"))
    ).scalar_one_or_none()
    assert assignment is None


# --- list / delete ---


async def test_list_invites_returns_empty_when_none(
    client: AsyncClient, harbor_h1, harbor_master
):
    r = await client.get(
        "/api/harbors/h1/berth-invites", cookies=_hm_cookies(harbor_master)
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_list_invites_requires_harbormaster(
    client: AsyncClient, harbor_h1, boat_owner
):
    r = await client.get(
        "/api/harbors/h1/berth-invites", cookies=auth_cookies(boat_owner.user_id)
    )
    assert r.status_code == 403


async def test_delete_invite_removes_row(
    client: AsyncClient, seeded_berth, harbor_master, captured_emails, session
):
    await _create_invite(client, harbor_master)
    invite = (await session.execute(select(BerthInvite))).scalar_one()
    r = await client.delete(
        f"/api/harbors/h1/berth-invites/{invite.invite_id}",
        cookies=_hm_cookies(harbor_master),
    )
    assert r.status_code == 204
    remaining = (await session.execute(select(BerthInvite))).scalars().all()
    assert remaining == []


async def test_delete_invite_unknown_returns_404(
    client: AsyncClient, harbor_h1, harbor_master
):
    r = await client.delete(
        "/api/harbors/h1/berth-invites/does-not-exist",
        cookies=_hm_cookies(harbor_master),
    )
    assert r.status_code == 404

from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Assignment, BerthAvailabilityWindow, Harbor, User
from tests._helpers import auth_cookies as _creds
from tests._helpers import hash_password


@pytest_asyncio.fixture
async def harbors_world(session: AsyncSession, harbor_h1):
    # shared fixture seeds h1 with default name, override for ordering check
    h1 = await session.get(Harbor, "h1")
    h1.name = "Lidingö Harbor"
    session.add(Harbor(harbor_id="h2", name="Saltsjöbaden Marina"))
    await session.commit()


async def test_list_harbors_requires_auth(client: AsyncClient, harbors_world):
    r = await client.get("/api/harbors")
    assert r.status_code == 401


async def test_list_harbors_returns_all_for_boat_owner(
    client: AsyncClient, boat_owner: User, harbors_world
):
    r = await client.get(
        "/api/harbors",
        cookies=_creds(boat_owner.user_id),
    )
    assert r.status_code == 200
    body = r.json()
    # ordered by name, not insertion order
    assert [h["harbor_id"] for h in body] == ["h1", "h2"]
    assert body[0]["name"] == "Lidingö Harbor"


async def test_list_harbors_returns_all_for_harbormaster(
    client: AsyncClient, harbor_master: User, harbors_world
):
    r = await client.get(
        "/api/harbors",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    assert [h["harbor_id"] for h in r.json()] == ["h1", "h2"]


# --- harbor user search ---


@pytest_asyncio.fixture
async def harbor_known_users(
    session: AsyncSession, seeded_berth, harbor_master, boat_owner
):
    # tenant linked via Assignment
    session.add(Assignment(berth_id="b1", user_id=boat_owner.user_id))
    # visitor linked via availability window
    visitor = User(
        user_id="v1",
        firstname="Vera",
        lastname="Visitor",
        email="vera@example.com",
        password_hash=hash_password("secret"),
    )
    # outsider not linked to h1 in any way
    outsider = User(
        user_id="x1",
        firstname="Xander",
        lastname="Outside",
        email="xander@example.com",
        password_hash=hash_password("secret"),
    )
    session.add_all([visitor, outsider])
    await session.flush()
    now = datetime.now(UTC)
    session.add(
        BerthAvailabilityWindow(
            window_id="w-search-1",
            berth_id="b1",
            user_id=visitor.user_id,
            from_date=now - timedelta(days=1),
            return_date=now + timedelta(days=1),
        )
    )
    await session.commit()
    return {"tenant": boat_owner, "visitor": visitor, "outsider": outsider}


async def test_search_harbor_users_returns_tenants_and_visitors(
    client: AsyncClient, harbor_known_users, harbor_master
):
    r = await client.get(
        "/api/harbors/h1/users",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    emails = sorted(u["email"] for u in r.json())
    assert harbor_known_users["tenant"].email in emails
    assert harbor_known_users["visitor"].email in emails
    assert harbor_known_users["outsider"].email not in emails


async def test_search_harbor_users_filters_by_q(
    client: AsyncClient, harbor_known_users, harbor_master
):
    r = await client.get(
        "/api/harbors/h1/users?q=ver",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert emails == [harbor_known_users["visitor"].email]


async def test_search_harbor_users_q_matches_name_prefix(
    client: AsyncClient, harbor_known_users, harbor_master
):
    r = await client.get(
        "/api/harbors/h1/users?q=Olle",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert emails == [harbor_known_users["tenant"].email]


async def test_search_harbor_users_requires_harbormaster(
    client: AsyncClient, harbor_known_users, boat_owner
):
    r = await client.get(
        "/api/harbors/h1/users",
        cookies=_creds(boat_owner.user_id),
    )
    assert r.status_code == 403


async def test_search_harbor_users_unauth_returns_401(
    client: AsyncClient, harbor_known_users
):
    r = await client.get("/api/harbors/h1/users")
    assert r.status_code == 401


async def test_search_harbor_users_isolates_harbors(
    client: AsyncClient, harbor_known_users, harbor_master, session
):
    # harbor_master only manages h1, so /h2/users must 403 even though h2 exists
    session.add(Harbor(harbor_id="h2", name="Other"))
    await session.commit()
    r = await client.get(
        "/api/harbors/h2/users",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 403

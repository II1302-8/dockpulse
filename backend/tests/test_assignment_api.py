import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Assignment, Berth, Dock, Harbor, User
from tests._helpers import auth_cookies, hash_password


@pytest_asyncio.fixture
async def second_owner(session: AsyncSession) -> User:
    user = User(
        user_id="o2",
        firstname="Olga",
        lastname="Owner",
        email="olga@example.com",
        password_hash=hash_password("secret"),
    )
    session.add(user)
    await session.commit()
    return user


async def test_assign_then_get_returns_assignment(
    client, seeded_berth, harbor_master, boat_owner
):
    r = await client.put(
        "/api/berths/b1/assignment",
        json={"user_id": boat_owner.user_id},
        cookies=auth_cookies(harbor_master.user_id),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "occupied"
    assert body["is_reserved"] is True
    assert body["assignment"] == {"berth_id": "b1", "user_id": boat_owner.user_id}

    r = await client.get("/api/berths/b1")
    assert r.json()["assignment"]["user_id"] == boat_owner.user_id


async def test_assign_replaces_previous_user(
    client, session, seeded_berth, harbor_master, boat_owner, second_owner
):
    creds = auth_cookies(harbor_master.user_id)

    await client.put(
        "/api/berths/b1/assignment",
        json={"user_id": boat_owner.user_id},
        cookies=creds,
    )
    r = await client.put(
        "/api/berths/b1/assignment",
        json={"user_id": second_owner.user_id},
        cookies=creds,
    )
    assert r.status_code == 200, r.text
    assert r.json()["assignment"]["user_id"] == second_owner.user_id

    rows = (await session.execute(select(Assignment))).scalars().all()
    assert len(rows) == 1
    assert rows[0].user_id == second_owner.user_id


async def test_remove_assignment_clears_state(
    client, session, seeded_berth, harbor_master, boat_owner
):
    creds = auth_cookies(harbor_master.user_id)
    await client.put(
        "/api/berths/b1/assignment",
        json={"user_id": boat_owner.user_id},
        cookies=creds,
    )

    r = await client.delete("/api/berths/b1/assignment", cookies=creds)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "free"
    assert body["is_reserved"] is False
    assert body["assignment"] is None

    assert (await session.execute(select(Assignment))).scalars().first() is None


async def test_assign_requires_harbormaster(client, seeded_berth, boat_owner):
    r = await client.put(
        "/api/berths/b1/assignment",
        json={"user_id": boat_owner.user_id},
        cookies=auth_cookies(boat_owner.user_id),
    )
    assert r.status_code == 403


async def test_assign_unknown_user_404(client, seeded_berth, harbor_master):
    r = await client.put(
        "/api/berths/b1/assignment",
        json={"user_id": "nope"},
        cookies=auth_cookies(harbor_master.user_id),
    )
    assert r.status_code == 404


async def test_assign_unknown_berth_404(client, harbor_master, boat_owner):
    r = await client.put(
        "/api/berths/nope/assignment",
        json={"user_id": boat_owner.user_id},
        cookies=auth_cookies(harbor_master.user_id),
    )
    assert r.status_code == 404


@pytest_asyncio.fixture
async def foreign_berth(session: AsyncSession):
    session.add_all(
        [
            Harbor(harbor_id="h2", name="Other Harbor"),
            Dock(dock_id="d2", harbor_id="h2", name="Other Dock"),
            Berth(berth_id="b2", dock_id="d2", status="free"),
        ]
    )
    await session.commit()


async def test_assign_foreign_harbor_returns_403(
    client, harbor_master, boat_owner, foreign_berth
):
    r = await client.put(
        "/api/berths/b2/assignment",
        json={"user_id": boat_owner.user_id},
        cookies=auth_cookies(harbor_master.user_id),
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Not authorized for this harbor"


async def test_remove_foreign_assignment_returns_403(
    client, harbor_master, foreign_berth
):
    r = await client.delete(
        "/api/berths/b2/assignment",
        cookies=auth_cookies(harbor_master.user_id),
    )
    assert r.status_code == 403


async def test_list_foreign_berth_events_returns_403(
    client, harbor_master, foreign_berth
):
    r = await client.get(
        "/api/berths/b2/events",
        cookies=auth_cookies(harbor_master.user_id),
    )
    assert r.status_code == 403

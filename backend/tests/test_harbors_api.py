import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Harbor, User
from tests._helpers import make_auth_token as _auth_token


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
        headers={"Authorization": f"Bearer {_auth_token(boat_owner.user_id)}"},
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
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    assert [h["harbor_id"] for h in r.json()] == ["h1", "h2"]

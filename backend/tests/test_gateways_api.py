import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dock, Gateway, Harbor, User
from tests._helpers import make_auth_token as _auth_token


@pytest_asyncio.fixture
async def gateways_world(session: AsyncSession):
    # gateway has no relationship() to dock, flush order not enforced, stage commits
    session.add_all(
        [
            Harbor(harbor_id="h1", name="Harbor 1"),
            Harbor(harbor_id="h2", name="Harbor 2"),
        ]
    )
    await session.commit()
    session.add_all(
        [
            Dock(dock_id="d1", harbor_id="h1", name="Dock 1"),
            Dock(dock_id="d2", harbor_id="h1", name="Dock 2"),
            Dock(dock_id="d3", harbor_id="h2", name="Dock 3"),
        ]
    )
    await session.commit()
    session.add_all(
        [
            Gateway(gateway_id="gw-a", dock_id="d1", name="A", status="online"),
            Gateway(gateway_id="gw-b", dock_id="d2", name="B", status="offline"),
            Gateway(gateway_id="gw-c", dock_id="d3", name="C", status="online"),
        ]
    )
    await session.commit()


async def test_list_gateways_requires_auth(client: AsyncClient, gateways_world):
    r = await client.get("/api/gateways")
    assert r.status_code == 401


async def test_list_gateways_rejects_boat_owner(
    client: AsyncClient, boat_owner: User, gateways_world
):
    r = await client.get(
        "/api/gateways",
        headers={"Authorization": f"Bearer {_auth_token(boat_owner.user_id)}"},
    )
    assert r.status_code == 403


async def test_list_gateways_returns_all_for_harbormaster(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert [g["gateway_id"] for g in body] == ["gw-a", "gw-b", "gw-c"]
    assert body[0]["dock_id"] == "d1"
    assert body[0]["status"] == "online"


async def test_list_gateways_filters_by_harbor(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways?harbor_id=h2",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert [g["gateway_id"] for g in body] == ["gw-c"]


async def test_list_gateways_filters_by_dock(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways?dock_id=d2",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert [g["gateway_id"] for g in body] == ["gw-b"]


async def test_list_gateways_filters_by_status(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways?status=online",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert [g["gateway_id"] for g in body] == ["gw-a", "gw-c"]


async def test_list_gateways_rejects_bad_status(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways?status=bogus",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 422

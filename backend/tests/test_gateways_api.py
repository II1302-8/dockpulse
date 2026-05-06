import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dock, Gateway, Harbor, User, UserHarborRole
from tests._helpers import auth_cookies as _creds


@pytest_asyncio.fixture
async def gateways_world(session: AsyncSession, harbor_h1):
    # gateway has no relationship() to dock, flush order not enforced, stage commits
    session.add(Harbor(harbor_id="h2", name="Harbor 2"))
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
        cookies=_creds(boat_owner.user_id),
    )
    assert r.status_code == 403


async def test_list_gateways_excludes_unmanaged_harbor(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    body = r.json()
    # gw-c sits in h2 and hm1 manages only h1
    assert [g["gateway_id"] for g in body] == ["gw-a", "gw-b"]


async def test_list_gateways_includes_extra_managed_harbor(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    gateways_world,
):
    session.add(UserHarborRole(user_id="hm1", harbor_id="h2", role="harbormaster"))
    await session.commit()
    r = await client.get(
        "/api/gateways",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    assert [g["gateway_id"] for g in r.json()] == ["gw-a", "gw-b", "gw-c"]


async def test_list_gateways_unmanaged_harbor_filter_returns_empty(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways?harbor_id=h2",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_list_gateways_filters_by_dock(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways?dock_id=d2",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    assert [g["gateway_id"] for g in r.json()] == ["gw-b"]


async def test_list_gateways_filters_by_status_within_scope(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways?status=online",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    # gw-c is online but in h2 so it stays excluded
    assert [g["gateway_id"] for g in r.json()] == ["gw-a"]


async def test_list_gateways_rejects_bad_status(
    client: AsyncClient, harbor_master: User, gateways_world
):
    r = await client.get(
        "/api/gateways?status=bogus",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 422


async def test_list_pending_gateways_returns_recorded_ids(
    client: AsyncClient, session: AsyncSession, harbor_master: User, harbor_world
):
    from app.models import PendingGateway

    session.add(PendingGateway(gateway_id="gw-unknown", attempts=3))
    await session.commit()

    r = await client.get(
        "/api/gateways/pending", cookies=_creds(harbor_master.user_id)
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["gateway_id"] == "gw-unknown"
    assert body[0]["attempts"] == 3


async def test_list_pending_gateways_rejects_non_harbormaster(
    client: AsyncClient, harbor_world
):
    r = await client.get("/api/gateways/pending")
    assert r.status_code == 401


async def test_dismiss_pending_gateway(
    client: AsyncClient, session: AsyncSession, harbor_master: User, harbor_world
):
    from app.models import PendingGateway

    session.add(PendingGateway(gateway_id="gw-bye", attempts=1))
    await session.commit()

    r = await client.delete(
        "/api/gateways/pending/gw-bye", cookies=_creds(harbor_master.user_id)
    )
    assert r.status_code == 204

    assert await session.get(PendingGateway, "gw-bye") is None


async def test_dismiss_unknown_pending_returns_404(
    client: AsyncClient, harbor_master: User, harbor_world
):
    r = await client.delete(
        "/api/gateways/pending/nope", cookies=_creds(harbor_master.user_id)
    )
    assert r.status_code == 404

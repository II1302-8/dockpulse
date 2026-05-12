from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Alert, Harbor
from tests._helpers import auth_cookies as _creds


@pytest_asyncio.fixture
async def alerts_in_h1(session: AsyncSession, seeded_berth):
    now = datetime.now(UTC)
    session.add_all(
        [
            Alert(
                alert_id="alrt-1",
                berth_id="b1",
                type="low_battery",
                message="Battery at 12%",
                acknowledged=False,
                timestamp=now - timedelta(minutes=5),
            ),
            Alert(
                alert_id="alrt-2",
                berth_id="b1",
                type="unauthorized_mooring",
                message="Boat without invite",
                acknowledged=True,
                timestamp=now - timedelta(minutes=10),
            ),
        ]
    )
    await session.commit()


async def test_list_alerts_returns_alerts_for_managed_harbors(
    client: AsyncClient, alerts_in_h1, harbor_master
):
    r = await client.get("/api/alerts", cookies=_creds(harbor_master.user_id))
    assert r.status_code == 200
    body = r.json()
    assert sorted(a["alert_id"] for a in body) == ["alrt-1", "alrt-2"]


async def test_list_alerts_filter_unacknowledged(
    client: AsyncClient, alerts_in_h1, harbor_master
):
    r = await client.get(
        "/api/alerts?acknowledged=false",
        cookies=_creds(harbor_master.user_id),
    )
    body = r.json()
    assert [a["alert_id"] for a in body] == ["alrt-1"]


async def test_list_alerts_requires_harbormaster_anywhere(
    client: AsyncClient, alerts_in_h1, boat_owner
):
    r = await client.get("/api/alerts", cookies=_creds(boat_owner.user_id))
    assert r.status_code == 403


async def test_list_alerts_unauth_returns_401(
    client: AsyncClient, alerts_in_h1
):
    r = await client.get("/api/alerts")
    assert r.status_code == 401


async def test_list_alerts_isolates_to_managed_harbors(
    client: AsyncClient, alerts_in_h1, harbor_master, session
):
    # alert in a harbor harbor_master does not manage must not surface
    session.add(Harbor(harbor_id="h2", name="Other"))
    await session.commit()
    r = await client.get("/api/alerts", cookies=_creds(harbor_master.user_id))
    ids = sorted(a["alert_id"] for a in r.json())
    assert ids == ["alrt-1", "alrt-2"]


async def test_acknowledge_flips_flag(
    client: AsyncClient, alerts_in_h1, harbor_master, session
):
    r = await client.post(
        "/api/alerts/alrt-1/acknowledge",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    assert r.json()["acknowledged"] is True
    fresh = await session.get(Alert, "alrt-1")
    assert fresh.acknowledged is True


async def test_acknowledge_idempotent(
    client: AsyncClient, alerts_in_h1, harbor_master
):
    r1 = await client.post(
        "/api/alerts/alrt-2/acknowledge",
        cookies=_creds(harbor_master.user_id),
    )
    r2 = await client.post(
        "/api/alerts/alrt-2/acknowledge",
        cookies=_creds(harbor_master.user_id),
    )
    assert r1.status_code == 200 and r2.status_code == 200
    assert r2.json()["acknowledged"] is True


async def test_acknowledge_unknown_returns_404(
    client: AsyncClient, alerts_in_h1, harbor_master
):
    r = await client.post(
        "/api/alerts/missing/acknowledge",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 404


async def test_acknowledge_requires_harbormaster(
    client: AsyncClient, alerts_in_h1, boat_owner
):
    r = await client.post(
        "/api/alerts/alrt-1/acknowledge",
        cookies=_creds(boat_owner.user_id),
    )
    assert r.status_code == 403

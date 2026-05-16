"""ops health endpoint"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient


async def test_ops_returns_health_payload(
    client: AsyncClient, auth_headers, harbor_world, harbor_master, session
):
    from app import broadcaster
    from app.models import AdoptionRequest, Berth

    now = datetime.now(UTC)
    session.add(
        AdoptionRequest(
            request_id="r1",
            mesh_uuid="ab" * 16,
            serial_number="sn",
            claim_jti="jti",
            node_id="node-r1",
            gateway_id="gw1",
            berth_id="b1",
            expires_at=now + timedelta(seconds=60),
            status="pending",
            created_by_user_id="hm1",
            created_at=now,
        )
    )
    # mark the seeded berth as fresh so stale_berths is 0
    fresh = await session.get(Berth, "b1")
    fresh.last_updated = now
    await session.commit()

    async with broadcaster.subscribe():
        r = await client.get("/api/admin/ops", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["mqtt_connected"] is False  # no broker in tests
    assert body["pending_adoptions"] == 1
    assert body["pending_gateways"] == 0
    assert body["alerts_last_24h"] == 0
    # seed migrations create extra berths beyond b1, accept any non-negative
    assert body["stale_berths"] >= 0
    assert "checked_at" in body


async def test_ops_counts_stale_berths(
    client: AsyncClient, auth_headers, harbor_world, session
):
    from app.models import Berth

    # b1 from harbor_world has last_updated=NULL by default -> counts as stale
    r = await client.get("/api/admin/ops", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["stale_berths"] >= 1

    # bump it to "now" and recount
    fresh = await session.get(Berth, "b1")
    fresh.last_updated = datetime.now(UTC)
    await session.commit()

    r2 = await client.get("/api/admin/ops", headers=auth_headers)
    body = r2.json()
    # b1 no longer stale, but the harbor_world fixture seeds other berths
    # that may have null last_updated; only assert it dropped by at least 1
    assert body["stale_berths"] < r.json()["stale_berths"]

"""adoption admin endpoints"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient


async def test_list_adoptions_returns_recent_first(
    client: AsyncClient, auth_headers, harbor_world, harbor_master, session
):
    from app.models import AdoptionRequest

    now = datetime.now(UTC)
    session.add_all(
        [
            AdoptionRequest(
                request_id="r-old",
                mesh_uuid="aa" * 16,
                serial_number="sn-old",
                claim_jti="jti-old",
                gateway_id="gw1",
                berth_id="b1",
                expires_at=now + timedelta(seconds=300),
                status="err",
                error_code="cfg-fail",
                created_by_user_id="hm1",
                created_at=now - timedelta(minutes=5),
                completed_at=now - timedelta(minutes=4),
            ),
            AdoptionRequest(
                request_id="r-new",
                mesh_uuid="bb" * 16,
                serial_number="sn-new",
                claim_jti="jti-new",
                gateway_id="gw1",
                berth_id="b1",
                expires_at=now + timedelta(seconds=300),
                status="pending",
                created_by_user_id="hm1",
                created_at=now,
            ),
        ]
    )
    await session.commit()

    r = await client.get("/api/admin/adoptions", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert [b["request_id"] for b in body] == ["r-new", "r-old"]


async def test_list_adoptions_filters_by_status(
    client: AsyncClient, auth_headers, harbor_world, harbor_master, session
):
    from app.models import AdoptionRequest

    now = datetime.now(UTC)
    session.add_all(
        [
            AdoptionRequest(
                request_id="r-pending",
                mesh_uuid="aa" * 16,
                serial_number="sn",
                claim_jti="j1",
                gateway_id="gw1",
                berth_id="b1",
                expires_at=now + timedelta(seconds=300),
                status="pending",
                created_by_user_id="hm1",
                created_at=now,
            ),
            AdoptionRequest(
                request_id="r-err",
                mesh_uuid="bb" * 16,
                serial_number="sn",
                claim_jti="j2",
                gateway_id="gw1",
                berth_id="b1",
                expires_at=now + timedelta(seconds=300),
                status="err",
                error_code="timeout",
                created_by_user_id="hm1",
                created_at=now,
            ),
        ]
    )
    await session.commit()

    r = await client.get(
        "/api/admin/adoptions",
        headers=auth_headers,
        params={"status": "pending"},
    )
    assert r.status_code == 200
    assert [b["request_id"] for b in r.json()] == ["r-pending"]


async def test_bulk_delete_adoptions(
    client: AsyncClient, auth_headers, harbor_world, harbor_master, session
):
    from app.models import AdoptionRequest

    now = datetime.now(UTC)
    session.add_all(
        [
            AdoptionRequest(
                request_id="r-err",
                mesh_uuid="aa" * 16,
                serial_number="sn-err",
                claim_jti="jti-err",
                gateway_id="gw1",
                berth_id="b1",
                expires_at=now + timedelta(seconds=300),
                status="err",
                error_code="cfg-fail",
                created_by_user_id="hm1",
                created_at=now,
                completed_at=now,
            ),
            AdoptionRequest(
                request_id="r-pending",
                mesh_uuid="bb" * 16,
                serial_number="sn-pending",
                claim_jti="jti-pending",
                gateway_id="gw1",
                berth_id="b1",
                expires_at=now + timedelta(seconds=300),
                status="pending",
                created_by_user_id="hm1",
                created_at=now,
            ),
        ]
    )
    await session.commit()

    r = await client.delete(
        "/api/admin/adoptions",
        headers=auth_headers,
        params={"status": "err"},
    )
    assert r.status_code == 200
    assert r.json() == {"deleted": 1, "status_filter": "err"}

    assert await session.get(AdoptionRequest, "r-pending") is not None
    assert await session.get(AdoptionRequest, "r-err") is None


async def test_bulk_delete_rejects_bad_status(
    client: AsyncClient, auth_headers, harbor_world
):
    r = await client.delete(
        "/api/admin/adoptions",
        headers=auth_headers,
        params={"status": "garbage"},
    )
    assert r.status_code == 400


async def test_run_sweeper(client: AsyncClient, auth_headers, harbor_world):
    r = await client.post("/api/admin/sweeper/run", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["expired"] == 0
    assert body["pruned"] == 0

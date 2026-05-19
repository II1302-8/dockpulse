"""berth crud + reset"""

from httpx import AsyncClient


async def test_create_berth(client: AsyncClient, auth_headers, harbor_world):
    r = await client.post(
        "/api/admin/berths",
        headers=auth_headers,
        json={
            "berth_id": "b-new",
            "dock_id": "d1",
            "label": "B-New",
            "length_m": 12.0,
        },
    )
    assert r.status_code == 201


async def test_reset_berth(client: AsyncClient, auth_headers, harbor_world, session):
    from app.models import Berth

    b = await session.get(Berth, "b1")
    b.status = "occupied"
    b.sensor_raw = 250
    await session.commit()

    r = await client.post("/api/admin/berths/b1/reset", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "free"


async def test_set_manual_status_locked(
    client: AsyncClient, auth_headers, harbor_world, session
):
    from app.events import process_sensor_reading
    from app.models import Berth

    r = await client.put(
        "/api/admin/berths/b1/manual-status",
        headers=auth_headers,
        json={"status": "occupied", "locked": True},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "occupied"
    assert body["manual_status"] == "occupied"
    assert body["manual_status_locked"] is True
    assert body["manual_status_set_by"]

    # sensor reports free, locked override holds display at occupied
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=False,
        sensor_raw=10,
    )
    b = await session.get(Berth, "b1")
    assert b.status == "occupied"
    assert b.sensor_status == "free"
    assert b.manual_status == "occupied"
    assert b.manual_status_locked is True


async def test_set_manual_status_soft_is_consumed_by_sensor(
    client: AsyncClient, auth_headers, harbor_world, session
):
    from app.events import process_sensor_reading
    from app.models import Berth

    r = await client.put(
        "/api/admin/berths/b1/manual-status",
        headers=auth_headers,
        json={"status": "occupied", "locked": False},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "occupied"

    # first sensor reading consumes the soft override
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=False,
        sensor_raw=10,
    )
    b = await session.get(Berth, "b1")
    assert b.status == "free"
    assert b.sensor_status == "free"
    assert b.manual_status is None
    assert b.manual_status_set_by is None


async def test_clear_manual_status_reverts_to_sensor_truth(
    client: AsyncClient, auth_headers, harbor_world, session
):
    from app.events import process_sensor_reading
    from app.models import Berth

    # sensor first reports occupied, then admin overrides to free with lock
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    r = await client.put(
        "/api/admin/berths/b1/manual-status",
        headers=auth_headers,
        json={"status": "free", "locked": True},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "free"

    # clearing the override restores last sensor reading, not the default
    r = await client.delete("/api/admin/berths/b1/manual-status", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "occupied"
    assert body["manual_status"] is None

    b = await session.get(Berth, "b1")
    assert b.status == "occupied"
    assert b.sensor_status == "occupied"


async def test_clear_manual_status_is_idempotent(
    client: AsyncClient, auth_headers, harbor_world
):
    r = await client.delete("/api/admin/berths/b1/manual-status", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["manual_status"] is None


async def test_admin_list_berths_includes_override_fields(
    client: AsyncClient, auth_headers, harbor_world
):
    await client.put(
        "/api/admin/berths/b1/manual-status",
        headers=auth_headers,
        json={"status": "occupied", "locked": True},
    )
    r = await client.get("/api/admin/berths", headers=auth_headers)
    assert r.status_code == 200
    row = next(b for b in r.json() if b["berth_id"] == "b1")
    assert row["manual_status"] == "occupied"
    assert row["manual_status_locked"] is True
    assert "manual_status_set_at" in row

from app.events import process_sensor_reading
from tests._helpers import auth_cookies


async def test_api_reflects_mqtt_reading(client, session, seeded_berth):
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
        battery_pct=80,
    )

    r = await client.get("/api/berths/b1")
    assert r.status_code == 200
    data = r.json()
    assert data["berth_id"] == "b1"
    assert data["status"] == "occupied"
    assert data["sensor_raw"] == 500
    assert data["battery_pct"] == 80
    assert data["last_updated"] is not None


async def test_api_filter_by_status(client, session, seeded_berth):
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )

    r_occupied = await client.get("/api/berths?status=occupied")
    assert r_occupied.status_code == 200
    assert [b["berth_id"] for b in r_occupied.json()] == ["b1"]

    r_free = await client.get("/api/berths?status=free")
    assert r_free.status_code == 200
    assert r_free.json() == []


async def test_api_unknown_berth_404(client):
    r = await client.get("/api/berths/does-not-exist")
    assert r.status_code == 404


async def test_list_berth_events_empty(client, seeded_berth, harbor_master):
    r = await client.get(
        "/api/berths/b1/events", cookies=auth_cookies(harbor_master.user_id)
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_list_berth_events_returns_events(
    client, session, seeded_berth, harbor_master
):
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    r = await client.get(
        "/api/berths/b1/events", cookies=auth_cookies(harbor_master.user_id)
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["event_type"] == "occupied"
    assert data[0]["node_id"] == "n1"


async def test_list_berth_events_requires_auth(client, seeded_berth):
    r = await client.get("/api/berths/b1/events")
    assert r.status_code == 401


async def test_list_berth_events_unknown_berth(client, harbor_master):
    r = await client.get(
        "/api/berths/does-not-exist/events",
        cookies=auth_cookies(harbor_master.user_id),
    )
    assert r.status_code == 404

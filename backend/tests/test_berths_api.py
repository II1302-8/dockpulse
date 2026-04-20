from app.events import process_sensor_reading


async def test_api_reflects_mqtt_reading(client, session, seeded_berth):
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
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
        session, berth_id="b1", node_id="n1", occupied=True, sensor_raw=500
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

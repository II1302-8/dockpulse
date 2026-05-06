"""Berth CRUD + reset."""

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

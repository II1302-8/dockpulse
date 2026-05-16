"""factory_devices admin endpoints"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient


async def _seed(session, serial: str, exp: datetime) -> None:
    from app.models import FactoryDevice

    # mesh_uuid is UNIQUE, derive per-serial so seeded rows don't collide
    uuid = (f"{abs(hash(serial)) & 0xFFFFFFFF:08x}" + "0" * 24)[:32]
    session.add(
        FactoryDevice(
            serial_number=serial,
            mesh_uuid=uuid,
            oob_hex=("cd" * 16),
            claim_jti=f"jti-{serial}",
            claim_exp=exp,
            registered_at=datetime.now(UTC),
        )
    )
    await session.commit()


async def test_upsert_creates_and_updates(client: AsyncClient, auth_headers, session):
    body = {
        "serial_number": "DP-N-000123",
        "mesh_uuid": "0123456789abcdef0123456789abcdef",
        "oob_hex": "00112233445566778899aabbccddeeff",
        "claim_jti": "00000000-0000-4000-8000-000000000001",
        "claim_exp": int(datetime.now(UTC).timestamp()) + 3600,
    }
    r = await client.put(
        "/api/admin/factory-devices/DP-N-000123",
        headers=auth_headers,
        json=body,
    )
    assert r.status_code == 200
    assert r.json()["serial_number"] == "DP-N-000123"

    # second PUT rotates jti + exp
    body["claim_jti"] = "00000000-0000-4000-8000-000000000002"
    r2 = await client.put(
        "/api/admin/factory-devices/DP-N-000123",
        headers=auth_headers,
        json=body,
    )
    assert r2.status_code == 200

    from app.models import FactoryDevice

    row = await session.get(FactoryDevice, "DP-N-000123")
    assert row is not None
    assert row.claim_jti == "00000000-0000-4000-8000-000000000002"


async def test_upsert_path_body_mismatch_400(client: AsyncClient, auth_headers):
    body = {
        "serial_number": "DP-N-OTHER",
        "mesh_uuid": "0123456789abcdef0123456789abcdef",
        "oob_hex": "00112233445566778899aabbccddeeff",
        "claim_jti": "00000000-0000-4000-8000-000000000001",
        "claim_exp": int(datetime.now(UTC).timestamp()) + 3600,
    }
    r = await client.put(
        "/api/admin/factory-devices/DP-N-000123",
        headers=auth_headers,
        json=body,
    )
    assert r.status_code == 400


async def test_list_filters_by_expiry_bucket(
    client: AsyncClient, auth_headers, session
):
    now = datetime.now(UTC)
    await _seed(session, "expired", now - timedelta(days=10))
    await _seed(session, "soon", now + timedelta(days=10))
    await _seed(session, "healthy", now + timedelta(days=180))

    r_all = await client.get("/api/admin/factory-devices", headers=auth_headers)
    assert r_all.status_code == 200
    # ordered ascending by claim_exp
    assert [d["serial_number"] for d in r_all.json()] == ["expired", "soon", "healthy"]

    r_exp = await client.get(
        "/api/admin/factory-devices?expiry=expired", headers=auth_headers
    )
    assert [d["serial_number"] for d in r_exp.json()] == ["expired"]

    r_soon = await client.get(
        "/api/admin/factory-devices?expiry=expiring_soon", headers=auth_headers
    )
    assert [d["serial_number"] for d in r_soon.json()] == ["soon"]

    r_healthy = await client.get(
        "/api/admin/factory-devices?expiry=healthy", headers=auth_headers
    )
    assert [d["serial_number"] for d in r_healthy.json()] == ["healthy"]


async def test_delete_removes_row(client: AsyncClient, auth_headers, session):
    now = datetime.now(UTC)
    await _seed(session, "to-delete", now + timedelta(days=30))

    r = await client.delete(
        "/api/admin/factory-devices/to-delete", headers=auth_headers
    )
    assert r.status_code == 204

    from app.models import FactoryDevice

    assert await session.get(FactoryDevice, "to-delete") is None


async def test_delete_unknown_404(client: AsyncClient, auth_headers):
    r = await client.delete("/api/admin/factory-devices/missing", headers=auth_headers)
    assert r.status_code == 404

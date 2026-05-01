"""Tests for the gateway-side MQTT handlers (provision/resp + status).

Calls the handlers directly without a real broker, mirroring the
existing `test_mqtt_dispatch.py` style.
"""

from datetime import UTC, datetime

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AdoptionRequest,
    Berth,
    Dock,
    Gateway,
    Harbor,
    Node,
    User,
)
from app.mqtt import (
    _handle_gateway_status,
    _handle_provision_resp,
    _parse_gateway_topic,
)


@pytest_asyncio.fixture
async def adoption_setup(session: AsyncSession) -> AdoptionRequest:
    """Pre-existing harbor/dock/berth/gateway/user + a pending request."""
    session.add_all(
        [
            Harbor(harbor_id="h1", name="H"),
            Dock(dock_id="d1", harbor_id="h1", name="D"),
        ]
    )
    await session.commit()
    session.add(Berth(berth_id="b1", dock_id="d1", status="free"))
    session.add(Gateway(gateway_id="gw1", dock_id="d1", name="GW", status="online"))
    session.add(
        User(
            user_id="hm1",
            firstname="Hilda",
            lastname="M",
            email="h@example.com",
            password_hash="x",
            role="harbormaster",
        )
    )
    await session.commit()

    now = datetime.now(UTC)
    request = AdoptionRequest(
        request_id="req-1",
        mesh_uuid="abcd" * 8,
        serial_number="DP-N-1",
        claim_jti="jti-1",
        gateway_id="gw1",
        berth_id="b1",
        expires_at=now,
        status="pending",
        created_by_user_id="hm1",
        created_at=now,
    )
    session.add(request)
    await session.commit()
    return request


def test_parse_gateway_topic_extracts_id_and_kind():
    assert _parse_gateway_topic("dockpulse/v1/gw/gw1/provision/resp") == (
        "gw1",
        "provision/resp",
    )
    assert _parse_gateway_topic("dockpulse/v1/gw/gw1/status") == ("gw1", "status")
    assert _parse_gateway_topic("harbor/h1/d1/b1/status") is None
    assert _parse_gateway_topic("dockpulse/v1/foo/gw1/status") is None


async def test_provision_resp_ok_creates_node_and_finalizes_request(
    session: AsyncSession, adoption_setup: AdoptionRequest
):
    payload = {
        "req_id": "req-1",
        "status": "ok",
        "unicast_addr": "0x0007",
        "dev_key_fp": "sha256:fingerprint",
    }
    await _handle_provision_resp(session, payload)

    request = await session.get(AdoptionRequest, "req-1")
    assert request.status == "ok"
    assert request.mesh_unicast_addr == "0x0007"
    assert request.dev_key_fp == "sha256:fingerprint"
    assert request.completed_at is not None

    node = (
        await session.execute(select(Node).where(Node.berth_id == "b1"))
    ).scalar_one()
    assert node.mesh_uuid == "abcd" * 8
    assert node.serial_number == "DP-N-1"
    assert node.status == "provisioned"
    assert node.adopted_by_user_id == "hm1"


async def test_provision_resp_err_marks_request_without_creating_node(
    session: AsyncSession, adoption_setup: AdoptionRequest
):
    payload = {
        "req_id": "req-1",
        "status": "err",
        "code": "node_not_found",
        "msg": "no beacon detected",
    }
    await _handle_provision_resp(session, payload)

    request = await session.get(AdoptionRequest, "req-1")
    assert request.status == "err"
    assert request.error_code == "node_not_found"
    assert request.error_msg == "no beacon detected"

    nodes = (await session.execute(select(Node))).scalars().all()
    assert nodes == []


async def test_provision_resp_ignores_unknown_request(session: AsyncSession):
    await _handle_provision_resp(
        session,
        {"req_id": "missing", "status": "ok", "unicast_addr": "x", "dev_key_fp": "y"},
    )
    # Nothing to assert beyond not raising.


async def test_provision_resp_is_idempotent_on_completed_request(
    session: AsyncSession, adoption_setup: AdoptionRequest
):
    ok_payload = {
        "req_id": "req-1",
        "status": "ok",
        "unicast_addr": "0x0007",
        "dev_key_fp": "fp",
    }
    await _handle_provision_resp(session, ok_payload)
    # Second arrival (duplicate publish) must not create a second node.
    await _handle_provision_resp(session, ok_payload)

    nodes = (await session.execute(select(Node))).scalars().all()
    assert len(nodes) == 1


async def test_provision_resp_skips_invalid_payload(
    session: AsyncSession, adoption_setup: AdoptionRequest
):
    # status=ok but missing unicast_addr — must not finalize.
    await _handle_provision_resp(
        session, {"req_id": "req-1", "status": "ok", "dev_key_fp": "fp"}
    )
    request = await session.get(AdoptionRequest, "req-1")
    assert request.status == "pending"


async def test_gateway_status_marks_online(session: AsyncSession, adoption_setup):
    await _handle_gateway_status(session, "gw1", {"online": True})
    gateway = await session.get(Gateway, "gw1")
    assert gateway.status == "online"
    assert gateway.last_seen is not None


async def test_gateway_status_marks_offline(session: AsyncSession, adoption_setup):
    await _handle_gateway_status(session, "gw1", {"online": False})
    gateway = await session.get(Gateway, "gw1")
    assert gateway.status == "offline"


async def test_gateway_status_skips_unknown_gateway(session: AsyncSession):
    await _handle_gateway_status(session, "ghost", {"online": True})


async def test_gateway_status_skips_invalid_payload(
    session: AsyncSession, adoption_setup
):
    await _handle_gateway_status(session, "gw1", {})
    gateway = await session.get(Gateway, "gw1")
    # last_seen untouched because we bailed early.
    assert gateway.last_seen is None

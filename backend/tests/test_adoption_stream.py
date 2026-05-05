"""adoption SSE coverage limited by httpx ASGITransport not firing ASGI
disconnect on stream close, live reads against the SSE loop hang. tests
cover broadcaster contract, 404 path, and terminal-state snapshot which
exits before the loop"""

import asyncio
import json
from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app import broadcaster
from app.adoption.finalize import complete_adoption_err, complete_adoption_ok
from app.models import AdoptionRequest, User
from tests._helpers import make_auth_token as _auth_token


@pytest_asyncio.fixture
async def pending_request(
    session: AsyncSession, harbor_master: User, harbor_world
) -> AdoptionRequest:
    now = datetime.now(UTC)
    req = AdoptionRequest(
        request_id="req-pending",
        mesh_uuid="abcd" * 8,
        serial_number="DP-N-STREAM",
        claim_jti="stream-jti-1",
        gateway_id="gw1",
        berth_id="b1",
        expires_at=now + timedelta(seconds=60),
        status="pending",
        created_by_user_id=harbor_master.user_id,
        created_at=now,
    )
    session.add(req)
    await session.commit()
    return req


async def test_stream_404_for_unknown_request(
    client: AsyncClient, harbor_master: User, harbor_world
):
    r = await client.get(
        "/api/adoptions/nope/stream",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 404


async def test_stream_requires_auth(client: AsyncClient, harbor_world):
    r = await client.get("/api/adoptions/anything/stream")
    assert r.status_code == 401


async def test_stream_emits_snapshot_when_already_terminal(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    pending_request: AdoptionRequest,
):
    # terminal before connect so handler returns after snapshot, no loop hang
    await complete_adoption_ok(
        session,
        request_id="req-pending",
        mesh_unicast_addr="0x0042",
        dev_key_fp="9f3a8b2c4d1e7f60",
    )

    headers = {"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"}
    async with client.stream(
        "GET", "/api/adoptions/req-pending/stream", headers=headers
    ) as stream:
        assert stream.status_code == 200
        body = ""
        async for chunk in stream.aiter_text():
            body += chunk
            if "\n\n" in body:
                break

    frame = body.split("\n\n", 1)[0]
    event_name = next(
        line[len("event:") :].strip()
        for line in frame.splitlines()
        if line.startswith("event:")
    )
    data = json.loads(
        "\n".join(
            line[len("data:") :].strip()
            for line in frame.splitlines()
            if line.startswith("data:")
        )
    )
    assert event_name == "adoption.update"
    assert data["request"]["request_id"] == "req-pending"
    assert data["request"]["status"] == "ok"
    assert data["request"]["mesh_unicast_addr"] == "0x0042"


async def test_finalize_ok_publishes_event_matching_stream_filter(
    session: AsyncSession,
    pending_request: AdoptionRequest,
):
    async with broadcaster.subscribe() as queue:
        await complete_adoption_ok(
            session,
            request_id="req-pending",
            mesh_unicast_addr="0x0042",
            dev_key_fp="9f3a8b2c4d1e7f60",
        )
        event = await asyncio.wait_for(queue.get(), timeout=1.0)

    assert event["type"] == "adoption.update"
    assert event["request"]["request_id"] == "req-pending"
    assert event["request"]["status"] == "ok"
    assert event["request"]["mesh_unicast_addr"] == "0x0042"


async def test_finalize_err_publishes_event_matching_stream_filter(
    session: AsyncSession,
    pending_request: AdoptionRequest,
):
    async with broadcaster.subscribe() as queue:
        await complete_adoption_err(
            session,
            request_id="req-pending",
            error_code="timeout",
            error_msg="no beacon",
        )
        event = await asyncio.wait_for(queue.get(), timeout=1.0)

    assert event["type"] == "adoption.update"
    assert event["request"]["request_id"] == "req-pending"
    assert event["request"]["status"] == "err"
    assert event["request"]["error_code"] == "timeout"
    assert event["request"]["error_msg"] == "no beacon"


async def test_other_request_completion_emits_distinct_event(
    session: AsyncSession,
    harbor_master: User,
    pending_request: AdoptionRequest,
):
    now = datetime.now(UTC)
    other = AdoptionRequest(
        request_id="req-other",
        mesh_uuid="ffff" * 8,
        serial_number="DP-N-OTHER",
        claim_jti="other-jti",
        gateway_id="gw1",
        berth_id="b1",
        expires_at=now + timedelta(seconds=60),
        status="pending",
        created_by_user_id=harbor_master.user_id,
        created_at=now,
    )
    session.add(other)
    await session.commit()

    async with broadcaster.subscribe() as queue:
        await complete_adoption_err(session, request_id="req-other", error_code="busy")
        event = await asyncio.wait_for(queue.get(), timeout=1.0)

    assert event["request"]["request_id"] == "req-other"
    assert event["request"]["request_id"] != "req-pending"

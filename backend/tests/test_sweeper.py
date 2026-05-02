"""Tests for the adoption-request TTL sweeper."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.adoption.sweeper import sweep_once
from app.models import AdoptionRequest


def _make_request(request_id: str, *, expires_in: timedelta, status: str = "pending"):
    now = datetime.now(UTC)
    return AdoptionRequest(
        request_id=request_id,
        mesh_uuid="aaaa" * 8,
        serial_number=f"sn-{request_id}",
        claim_jti=f"jti-{request_id}",
        gateway_id="gw1",
        berth_id="b1",
        expires_at=now + expires_in,
        status=status,
        created_by_user_id="hm1",
        created_at=now,
    )


async def test_sweep_marks_expired_pending_as_timeout(
    session: AsyncSession, harbor_world, harbor_master
):
    session.add(_make_request("expired-1", expires_in=timedelta(seconds=-30)))
    await session.commit()

    swept = await sweep_once(session)
    assert swept == 1

    request = await session.get(AdoptionRequest, "expired-1")
    assert request.status == "err"
    assert request.error_code == "timeout"
    assert request.completed_at is not None


async def test_sweep_leaves_unexpired_pending_alone(
    session: AsyncSession, harbor_world, harbor_master
):
    session.add(_make_request("fresh", expires_in=timedelta(seconds=300)))
    await session.commit()

    swept = await sweep_once(session)
    assert swept == 0

    request = await session.get(AdoptionRequest, "fresh")
    assert request.status == "pending"


async def test_sweep_skips_already_completed_requests(
    session: AsyncSession, harbor_world, harbor_master
):
    session.add(_make_request("done", expires_in=timedelta(seconds=-30), status="ok"))
    await session.commit()

    swept = await sweep_once(session)
    assert swept == 0

    request = await session.get(AdoptionRequest, "done")
    assert request.status == "ok"


async def test_sweep_handles_multiple_expired_requests(
    session: AsyncSession, harbor_world, harbor_master
):
    session.add_all(
        [
            _make_request("e1", expires_in=timedelta(seconds=-60)),
            _make_request("e2", expires_in=timedelta(seconds=-30)),
            _make_request("fresh", expires_in=timedelta(seconds=120)),
        ]
    )
    await session.commit()

    swept = await sweep_once(session)
    assert swept == 2

    e1 = await session.get(AdoptionRequest, "e1")
    e2 = await session.get(AdoptionRequest, "e2")
    fresh = await session.get(AdoptionRequest, "fresh")
    assert e1.status == "err"
    assert e2.status == "err"
    assert fresh.status == "pending"

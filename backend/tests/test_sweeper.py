"""Tests for the adoption-request TTL sweeper."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.adoption.sweeper import ERR_RETENTION, prune_old_errors, sweep_once
from app.models import AdoptionRequest


def _make_request(
    request_id: str,
    *,
    expires_in: timedelta,
    status: str = "pending",
    completed_at: datetime | None = None,
):
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
        completed_at=completed_at,
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


async def test_prune_deletes_old_err_rows(
    session: AsyncSession, harbor_world, harbor_master
):
    old_completed = datetime.now(UTC) - ERR_RETENTION - timedelta(minutes=1)
    fresh_completed = datetime.now(UTC) - timedelta(minutes=1)
    session.add_all(
        [
            _make_request(
                "old-err",
                expires_in=timedelta(seconds=-3600),
                status="err",
                completed_at=old_completed,
            ),
            _make_request(
                "fresh-err",
                expires_in=timedelta(seconds=-60),
                status="err",
                completed_at=fresh_completed,
            ),
        ]
    )
    await session.commit()

    pruned = await prune_old_errors(session)
    assert pruned == 1

    assert await session.get(AdoptionRequest, "old-err") is None
    assert await session.get(AdoptionRequest, "fresh-err") is not None


async def test_prune_leaves_pending_and_ok_rows_alone(
    session: AsyncSession, harbor_world, harbor_master
):
    old_completed = datetime.now(UTC) - ERR_RETENTION - timedelta(hours=1)
    session.add_all(
        [
            _make_request(
                "stale-pending",
                expires_in=timedelta(seconds=-3600),
                status="pending",
            ),
            _make_request(
                "stale-ok",
                expires_in=timedelta(seconds=-3600),
                status="ok",
                completed_at=old_completed,
            ),
        ]
    )
    await session.commit()

    pruned = await prune_old_errors(session)
    assert pruned == 0

    assert await session.get(AdoptionRequest, "stale-pending") is not None
    assert await session.get(AdoptionRequest, "stale-ok") is not None

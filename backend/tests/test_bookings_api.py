from datetime import UTC, datetime, timedelta

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    BerthAvailabilityWindow,
    Booking,
    User,
)
from tests._helpers import auth_cookies, hash_password

# all booking dates live far in the future so cancellation gate stays open
WIN_FROM = datetime(2027, 6, 1, tzinfo=UTC)
WIN_TO = datetime(2027, 6, 30, tzinfo=UTC)
BK_FROM = datetime(2027, 6, 5, tzinfo=UTC)
BK_TO = datetime(2027, 6, 10, tzinfo=UTC)


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


@pytest_asyncio.fixture
async def visitor(session: AsyncSession) -> User:
    user = User(
        user_id="v1",
        firstname="Vera",
        lastname="Visitor",
        email="vera@example.com",
        password_hash=hash_password("secret"),
        email_verified=True,
    )
    session.add(user)
    await session.commit()
    return user


@pytest_asyncio.fixture
async def spot_owner(session: AsyncSession, boat_owner, seeded_berth) -> User:
    # boat_owner becomes the spot-owner of b1 via Assignment
    session.add(Assignment(berth_id="b1", user_id=boat_owner.user_id))
    await session.commit()
    return boat_owner


@pytest_asyncio.fixture
async def stranger(session: AsyncSession) -> User:
    # unrelated to any harbor or berth, used to verify 403s
    user = User(
        user_id="s1",
        firstname="Sven",
        lastname="Stranger",
        email="sven@example.com",
        password_hash=hash_password("secret"),
        email_verified=True,
    )
    session.add(user)
    await session.commit()
    return user


@pytest_asyncio.fixture
async def window(session: AsyncSession, spot_owner) -> BerthAvailabilityWindow:
    win = BerthAvailabilityWindow(
        window_id="w1",
        berth_id="b1",
        user_id=spot_owner.user_id,
        from_date=WIN_FROM,
        return_date=WIN_TO,
        created_at=datetime.now(UTC),
    )
    session.add(win)
    await session.commit()
    return win


# --- create / preflight ---


async def test_create_booking_happy_path(client, window, visitor):
    r = await client.post(
        "/api/berths/b1/bookings",
        json={
            "from_date": _iso(BK_FROM),
            "to_date": _iso(BK_TO),
            "boat_length_m": 8.5,
            "boat_width_m": 3.2,
            "boat_depth_m": 1.4,
            "notes": "arriving late",
        },
        cookies=auth_cookies(visitor.user_id),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["berth_id"] == "b1"
    assert body["user_id"] == visitor.user_id
    assert body["status"] == "confirmed"
    assert body["notes"] == "arriving late"
    assert body["boat_length_m"] == 8.5
    assert body["boat_width_m"] == 3.2
    assert body["boat_depth_m"] == 1.4


async def test_create_booking_no_window_returns_409(client, seeded_berth, visitor):
    r = await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_FROM), "to_date": _iso(BK_TO)},
        cookies=auth_cookies(visitor.user_id),
    )
    assert r.status_code == 409
    assert "window" in r.json()["detail"].lower()


async def test_create_booking_overlap_returns_409(
    client, session, window, visitor, boat_owner
):
    creds = auth_cookies(visitor.user_id)
    r1 = await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_FROM), "to_date": _iso(BK_TO)},
        cookies=creds,
    )
    assert r1.status_code == 201

    # second booking, overlapping middle of first, different visitor
    overlap_creds = auth_cookies(boat_owner.user_id)
    r2 = await client.post(
        "/api/berths/b1/bookings",
        json={
            "from_date": _iso(BK_FROM + timedelta(days=1)),
            "to_date": _iso(BK_TO + timedelta(days=1)),
        },
        cookies=overlap_creds,
    )
    assert r2.status_code == 409


async def test_create_booking_back_to_back_allowed(client, window, visitor, boat_owner):
    # half-open [from, to) so to_date == next from_date is fine
    r1 = await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_FROM), "to_date": _iso(BK_TO)},
        cookies=auth_cookies(visitor.user_id),
    )
    assert r1.status_code == 201

    r2 = await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_TO), "to_date": _iso(BK_TO + timedelta(days=2))},
        cookies=auth_cookies(boat_owner.user_id),
    )
    assert r2.status_code == 201, r2.text


async def test_create_booking_invalid_dates_returns_422(client, window, visitor):
    r = await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_TO), "to_date": _iso(BK_FROM)},
        cookies=auth_cookies(visitor.user_id),
    )
    assert r.status_code == 422


async def test_preflight_ok(client, window, visitor):
    r = await client.post(
        "/api/berths/b1/bookings:preflight",
        json={"from_date": _iso(BK_FROM), "to_date": _iso(BK_TO)},
        cookies=auth_cookies(visitor.user_id),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["window_id"] == "w1"
    assert body["conflicts"] == []


async def test_preflight_reports_no_window_and_overlap(
    client, window, visitor, boat_owner
):
    await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_FROM), "to_date": _iso(BK_TO)},
        cookies=auth_cookies(visitor.user_id),
    )
    # out of any window AND overlaps existing booking partially is hard, so
    # split: one preflight checks overlap only, one checks no_window only
    r_overlap = await client.post(
        "/api/berths/b1/bookings:preflight",
        json={
            "from_date": _iso(BK_FROM + timedelta(days=1)),
            "to_date": _iso(BK_TO),
        },
        cookies=auth_cookies(boat_owner.user_id),
    )
    body = r_overlap.json()
    assert body["ok"] is False
    kinds = {c["kind"] for c in body["conflicts"]}
    assert "overlap" in kinds

    r_nowin = await client.post(
        "/api/berths/b1/bookings:preflight",
        json={
            "from_date": _iso(WIN_TO + timedelta(days=2)),
            "to_date": _iso(WIN_TO + timedelta(days=4)),
        },
        cookies=auth_cookies(boat_owner.user_id),
    )
    body = r_nowin.json()
    assert body["ok"] is False
    assert {c["kind"] for c in body["conflicts"]} == {"no_window"}


# --- listing / browsing ---


async def test_bookable_berths_excludes_overlapping(
    client, window, visitor, harbor_master
):
    await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_FROM), "to_date": _iso(BK_TO)},
        cookies=auth_cookies(visitor.user_id),
    )
    # query overlapping the booked range
    r = await client.get(
        f"/api/harbors/h1/bookable-berths?from={_iso(BK_FROM)}&to={_iso(BK_TO)}",
        cookies=auth_cookies(visitor.user_id),
    )
    assert r.status_code == 200
    assert r.json() == []

    # query a free sub-range still sees the berth
    r2 = await client.get(
        f"/api/harbors/h1/bookable-berths?from={_iso(BK_TO)}&to={_iso(WIN_TO)}",
        cookies=auth_cookies(visitor.user_id),
    )
    assert r2.status_code == 200
    payload = r2.json()
    assert len(payload) == 1
    assert payload[0]["berth_id"] == "b1"
    assert payload[0]["window_id"] == "w1"


async def test_bookable_windows_lists_booked_subranges(client, window, visitor):
    await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_FROM), "to_date": _iso(BK_TO)},
        cookies=auth_cookies(visitor.user_id),
    )
    r = await client.get(
        "/api/berths/b1/bookable-windows",
        cookies=auth_cookies(visitor.user_id),
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["window_id"] == "w1"
    assert len(body[0]["booked"]) == 1
    assert body[0]["booked"][0]["from_date"].startswith("2027-06-05")


async def test_list_my_bookings(client, window, visitor):
    await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_FROM), "to_date": _iso(BK_TO)},
        cookies=auth_cookies(visitor.user_id),
    )
    r = await client.get("/api/bookings/me", cookies=auth_cookies(visitor.user_id))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == visitor.user_id


# --- cancellation ---


async def _create(client, visitor):
    r = await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": _iso(BK_FROM), "to_date": _iso(BK_TO)},
        cookies=auth_cookies(visitor.user_id),
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_visitor_cancels_own(client, window, visitor):
    booking = await _create(client, visitor)
    # bare DELETE with no body, as FE sends it
    r = await client.delete(
        f"/api/bookings/{booking['booking_id']}",
        cookies=auth_cookies(visitor.user_id),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "cancelled_by_visitor"
    assert body["cancelled_by"] == visitor.user_id
    assert body["cancel_reason"] is None


async def test_spot_owner_cancels_with_reason(client, window, visitor, spot_owner):
    booking = await _create(client, visitor)
    r = await client.request(
        "DELETE",
        f"/api/bookings/{booking['booking_id']}",
        json={"reason": "storm"},
        cookies=auth_cookies(spot_owner.user_id),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "cancelled_by_host"
    assert body["cancel_reason"] == "storm"


async def test_harbormaster_cancels_with_reason(client, window, visitor, harbor_master):
    booking = await _create(client, visitor)
    r = await client.request(
        "DELETE",
        f"/api/bookings/{booking['booking_id']}",
        json={"reason": "harbor closed"},
        cookies=auth_cookies(harbor_master.user_id),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled_by_host"


async def test_stranger_cannot_cancel(client, window, visitor, stranger):
    booking = await _create(client, visitor)
    r = await client.request(
        "DELETE",
        f"/api/bookings/{booking['booking_id']}",
        json={},
        cookies=auth_cookies(stranger.user_id),
    )
    assert r.status_code == 403


async def test_cancel_twice_returns_409(client, window, visitor):
    booking = await _create(client, visitor)
    creds = auth_cookies(visitor.user_id)
    r1 = await client.request(
        "DELETE", f"/api/bookings/{booking['booking_id']}", json={}, cookies=creds
    )
    assert r1.status_code == 200
    r2 = await client.request(
        "DELETE", f"/api/bookings/{booking['booking_id']}", json={}, cookies=creds
    )
    assert r2.status_code == 409


# --- host views ---


async def test_list_berth_bookings_requires_owner_or_hm(
    client, window, visitor, stranger
):
    await _create(client, visitor)

    r = await client.get(
        "/api/berths/b1/bookings", cookies=auth_cookies(stranger.user_id)
    )
    assert r.status_code == 403


async def test_list_berth_bookings_spot_owner_ok(
    client, session, window, visitor, spot_owner
):
    await _create(client, visitor)
    r = await client.get(
        "/api/berths/b1/bookings", cookies=auth_cookies(spot_owner.user_id)
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1


async def test_list_harbor_bookings_harbormaster_only(
    client, window, visitor, harbor_master, stranger
):
    await _create(client, visitor)

    r_ok = await client.get(
        "/api/harbors/h1/bookings", cookies=auth_cookies(harbor_master.user_id)
    )
    assert r_ok.status_code == 200
    assert r_ok.json()["total"] == 1

    r_forbidden = await client.get(
        "/api/harbors/h1/bookings", cookies=auth_cookies(stranger.user_id)
    )
    assert r_forbidden.status_code == 403


async def test_db_enforces_no_overlap_on_race(session: AsyncSession, window, visitor):
    # bypass the app, insert directly; EXCLUDE constraint must reject second row
    from sqlalchemy.exc import IntegrityError

    session.add(
        Booking(
            booking_id="bk1",
            berth_id="b1",
            user_id=visitor.user_id,
            from_date=BK_FROM,
            to_date=BK_TO,
            status="confirmed",
        )
    )
    await session.commit()

    session.add(
        Booking(
            booking_id="bk2",
            berth_id="b1",
            user_id=visitor.user_id,
            from_date=BK_FROM + timedelta(days=1),
            to_date=BK_TO + timedelta(days=1),
            status="confirmed",
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return
    raise AssertionError("expected IntegrityError from EXCLUDE constraint")


async def test_get_booking_authorized_views(
    client, window, visitor, spot_owner, harbor_master
):
    booking = await _create(client, visitor)
    bid = booking["booking_id"]

    for who in (visitor, spot_owner, harbor_master):
        r = await client.get(f"/api/bookings/{bid}", cookies=auth_cookies(who.user_id))
        assert r.status_code == 200, f"{who.user_id}: {r.status_code}"


async def test_create_invalid_isoformat_returns_422(client, window, visitor):
    r = await client.post(
        "/api/berths/b1/bookings",
        json={"from_date": "not-a-date", "to_date": _iso(BK_TO)},
        cookies=auth_cookies(visitor.user_id),
    )
    assert r.status_code == 422


async def test_create_uses_uuid_for_booking_id(client, window, visitor, session):
    await _create(client, visitor)
    row = (await session.execute(select(Booking))).scalar_one()
    # uuid4 hex with dashes is 36 chars
    assert len(row.booking_id) == 36

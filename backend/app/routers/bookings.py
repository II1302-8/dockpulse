import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.auth import get_current_user
from app.dependencies import (
    CurrentUserDep,
    SessionDep,
    harbor_id_from_berth,
    require_harbor_authority,
)
from app.models import (
    Assignment,
    Berth,
    BerthAvailabilityWindow,
    Booking,
    Dock,
    UserHarborRole,
)
from app.schemas import (
    BookableBerthOut,
    BookableWindowOut,
    BookedRange,
    BookingCancelIn,
    BookingConflict,
    BookingCreate,
    BookingList,
    BookingOut,
    BookingPreflightIn,
    BookingPreflightOut,
)

router = APIRouter(prefix="/api", tags=["bookings"])

# statuses that hold the slot; everything else frees it
_ACTIVE_STATUSES = ("confirmed",)


async def _load_booking(session, booking_id: str) -> Booking:
    booking = await session.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


async def _is_spot_owner(session, berth_id: str, user_id: str) -> bool:
    row = await session.execute(
        select(Assignment.berth_id).where(
            Assignment.berth_id == berth_id,
            Assignment.user_id == user_id,
        )
    )
    return row.scalar_one_or_none() is not None


async def _is_harbormaster(session, harbor_id: str, user_id: str) -> bool:
    row = await session.execute(
        select(UserHarborRole.user_id).where(
            UserHarborRole.user_id == user_id,
            UserHarborRole.harbor_id == harbor_id,
            UserHarborRole.role == "harbormaster",
        )
    )
    return row.scalar_one_or_none() is not None


# grace for client clock skew; smaller than the shortest sensible booking
_PAST_GRACE = timedelta(minutes=5)


def _validate_dates(
    from_date: datetime, to_date: datetime, *, allow_past: bool = False
) -> None:
    if to_date <= from_date:
        raise HTTPException(status_code=422, detail="to_date must be after from_date")
    if not allow_past and from_date < datetime.now(UTC) - _PAST_GRACE:
        raise HTTPException(status_code=422, detail="from_date is in the past")


def _boat_fit_reason(
    berth: Berth,
    length_m: float | None,
    width_m: float | None,
    depth_m: float | None,
) -> str | None:
    bl, bw, bd = berth.length_m, berth.width_m, berth.depth_m
    if length_m is not None and bl is not None and length_m > bl:
        return f"Boat length {length_m}m exceeds berth length {bl}m"
    if width_m is not None and bw is not None and width_m > bw:
        return f"Boat width {width_m}m exceeds berth width {bw}m"
    if depth_m is not None and bd is not None and depth_m > bd:
        return f"Boat depth {depth_m}m exceeds berth depth {bd}m"
    return None


async def _find_covering_window(
    session, berth_id: str, from_date: datetime, to_date: datetime
) -> str | None:
    """Returns window_id of an availability window fully covering [from, to)."""
    row = await session.execute(
        select(BerthAvailabilityWindow.window_id).where(
            BerthAvailabilityWindow.berth_id == berth_id,
            BerthAvailabilityWindow.from_date <= from_date,
            BerthAvailabilityWindow.return_date >= to_date,
        )
    )
    return row.scalar_one_or_none()


async def _find_overlapping_booking(
    session,
    berth_id: str,
    from_date: datetime,
    to_date: datetime,
    exclude_id: str | None = None,
) -> Booking | None:
    stmt = select(Booking).where(
        Booking.berth_id == berth_id,
        Booking.status.in_(_ACTIVE_STATUSES),
        Booking.from_date < to_date,
        Booking.to_date > from_date,
    )
    if exclude_id is not None:
        stmt = stmt.where(Booking.booking_id != exclude_id)
    return (await session.execute(stmt)).scalars().first()


# --- browse / search ---


@router.get(
    "/harbors/{harbor_id}/bookable-berths",
    response_model=list[BookableBerthOut],
    operation_id="listBookableBerths",
    summary="List berths in a harbor bookable across a date range",
    dependencies=[Depends(get_current_user)],
)
async def list_bookable_berths(
    harbor_id: str,
    session: SessionDep,
    from_date: datetime = Query(..., alias="from"),  # noqa: B008
    to_date: datetime = Query(..., alias="to"),  # noqa: B008
    length_m: float | None = Query(None, ge=0),  # noqa: B008
    width_m: float | None = Query(None, ge=0),  # noqa: B008
    depth_m: float | None = Query(None, ge=0),  # noqa: B008
):
    _validate_dates(from_date, to_date)

    # subquery: an active booking on this berth overlapping [from, to)
    overlap_subq = (
        select(Booking.berth_id)
        .where(
            Booking.berth_id == Berth.berth_id,
            Booking.status.in_(_ACTIVE_STATUSES),
            Booking.from_date < to_date,
            Booking.to_date > from_date,
        )
        .exists()
    )

    stmt = (
        select(
            Berth,
            Dock.harbor_id,
            BerthAvailabilityWindow.window_id,
            BerthAvailabilityWindow.from_date,
            BerthAvailabilityWindow.return_date,
        )
        .join(Dock, Dock.dock_id == Berth.dock_id)
        .join(
            BerthAvailabilityWindow,
            BerthAvailabilityWindow.berth_id == Berth.berth_id,
        )
        .where(
            Dock.harbor_id == harbor_id,
            BerthAvailabilityWindow.from_date <= from_date,
            BerthAvailabilityWindow.return_date >= to_date,
            ~overlap_subq,
        )
    )
    if length_m is not None:
        stmt = stmt.where(Berth.length_m >= length_m)
    if width_m is not None:
        stmt = stmt.where(Berth.width_m >= width_m)
    if depth_m is not None:
        stmt = stmt.where(Berth.depth_m >= depth_m)

    rows = (await session.execute(stmt)).all()
    return [
        BookableBerthOut(
            berth_id=berth.berth_id,
            dock_id=berth.dock_id,
            harbor_id=harbor_id_,
            label=berth.label,
            length_m=berth.length_m,
            width_m=berth.width_m,
            depth_m=berth.depth_m,
            window_id=win_id,
            window_from=win_from,
            window_to=win_to,
        )
        for berth, harbor_id_, win_id, win_from, win_to in rows
    ]


@router.get(
    "/berths/{berth_id}/bookable-windows",
    response_model=list[BookableWindowOut],
    operation_id="listBookableWindows",
    summary="List a berth's availability windows with booked sub-ranges",
    dependencies=[Depends(get_current_user)],
)
async def list_bookable_windows(
    berth_id: str,
    session: SessionDep,
    from_date: datetime | None = Query(None, alias="from"),  # noqa: B008
    to_date: datetime | None = Query(None, alias="to"),  # noqa: B008
):
    if not await session.get(Berth, berth_id):
        raise HTTPException(status_code=404, detail="Berth not found")

    win_stmt = select(BerthAvailabilityWindow).where(
        BerthAvailabilityWindow.berth_id == berth_id
    )
    if from_date is not None:
        win_stmt = win_stmt.where(BerthAvailabilityWindow.return_date > from_date)
    if to_date is not None:
        win_stmt = win_stmt.where(BerthAvailabilityWindow.from_date < to_date)
    win_stmt = win_stmt.order_by(BerthAvailabilityWindow.from_date)
    windows = (await session.execute(win_stmt)).scalars().all()
    if not windows:
        return []

    # cap booking scan to the union of returned windows so old bookings on
    # popular berths don't get pulled into memory
    span_from = min(w.from_date for w in windows)
    span_to = max(w.return_date for w in windows)
    bk_stmt = select(Booking).where(
        Booking.berth_id == berth_id,
        Booking.status.in_(_ACTIVE_STATUSES),
        Booking.from_date < span_to,
        Booking.to_date > span_from,
    )
    bookings = (await session.execute(bk_stmt)).scalars().all()

    out: list[BookableWindowOut] = []
    for w in windows:
        booked = [
            BookedRange(from_date=b.from_date, to_date=b.to_date)
            for b in bookings
            if b.from_date < w.return_date and b.to_date > w.from_date
        ]
        out.append(
            BookableWindowOut(
                window_id=w.window_id,
                berth_id=w.berth_id,
                from_date=w.from_date,
                return_date=w.return_date,
                booked=booked,
            )
        )
    return out


# --- visitor lifecycle ---


@router.post(
    "/berths/{berth_id}/bookings",
    response_model=BookingOut,
    status_code=201,
    operation_id="createBooking",
    summary="Create a booking on a berth",
)
async def create_booking(
    berth_id: str,
    body: BookingCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    _validate_dates(body.from_date, body.to_date)
    berth = await session.get(Berth, berth_id)
    if berth is None:
        raise HTTPException(status_code=404, detail="Berth not found")

    window_id = await _find_covering_window(
        session, berth_id, body.from_date, body.to_date
    )
    if window_id is None:
        raise HTTPException(
            status_code=409, detail="No availability window covers this range"
        )

    # body overrides for one-off boats, fall back to profile snapshot
    length_m = (
        body.boat_length_m
        if body.boat_length_m is not None
        else current_user.boat_length_m
    )
    width_m = (
        body.boat_width_m
        if body.boat_width_m is not None
        else current_user.boat_width_m
    )
    depth_m = (
        body.boat_depth_m
        if body.boat_depth_m is not None
        else current_user.boat_depth_m
    )
    fit_reason = _boat_fit_reason(berth, length_m, width_m, depth_m)
    if fit_reason is not None:
        raise HTTPException(status_code=409, detail=fit_reason)

    conflict = await _find_overlapping_booking(
        session, berth_id, body.from_date, body.to_date
    )
    if conflict is not None:
        raise HTTPException(status_code=409, detail="Overlaps an existing booking")

    booking = Booking(
        booking_id=str(uuid.uuid4()),
        berth_id=berth_id,
        user_id=current_user.user_id,
        from_date=body.from_date,
        to_date=body.to_date,
        status="confirmed",
        boat_length_m=length_m,
        boat_width_m=width_m,
        boat_depth_m=depth_m,
        notes=body.notes,
    )
    session.add(booking)
    try:
        await session.commit()
    except IntegrityError:
        # exclusion constraint caught a race the app-level check missed
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="Overlaps an existing booking"
        ) from None
    await session.refresh(booking)
    return booking


@router.post(
    "/berths/{berth_id}/bookings:preflight",
    response_model=BookingPreflightOut,
    operation_id="preflightBooking",
    summary="Validate a proposed booking without creating it",
)
async def preflight_booking(
    berth_id: str,
    body: BookingPreflightIn,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    berth = await session.get(Berth, berth_id)
    if berth is None:
        raise HTTPException(status_code=404, detail="Berth not found")

    conflicts: list[BookingConflict] = []
    if body.to_date <= body.from_date:
        conflicts.append(BookingConflict(kind="dates_invalid"))
        return BookingPreflightOut(ok=False, conflicts=conflicts)

    if body.from_date < datetime.now(UTC) - _PAST_GRACE:
        conflicts.append(BookingConflict(kind="in_past"))

    window_id = await _find_covering_window(
        session, berth_id, body.from_date, body.to_date
    )
    if window_id is None:
        conflicts.append(BookingConflict(kind="no_window"))

    fit_reason = _boat_fit_reason(
        berth,
        current_user.boat_length_m,
        current_user.boat_width_m,
        current_user.boat_depth_m,
    )
    if fit_reason is not None:
        conflicts.append(BookingConflict(kind="boat_too_big"))

    overlap = await _find_overlapping_booking(
        session, berth_id, body.from_date, body.to_date
    )
    if overlap is not None:
        conflicts.append(
            BookingConflict(
                kind="overlap",
                from_date=overlap.from_date,
                to_date=overlap.to_date,
            )
        )

    return BookingPreflightOut(
        ok=not conflicts,
        window_id=window_id,
        conflicts=conflicts,
    )


@router.get(
    "/bookings/me",
    response_model=BookingList,
    operation_id="listMyBookings",
    summary="List the current user's bookings",
)
async def list_my_bookings(
    session: SessionDep,
    current_user: CurrentUserDep,
    status: str | None = Query(None),  # noqa: B008
    from_date: datetime | None = Query(None, alias="from"),  # noqa: B008
    to_date: datetime | None = Query(None, alias="to"),  # noqa: B008
):
    stmt = select(Booking).where(Booking.user_id == current_user.user_id)
    if status:
        stmt = stmt.where(Booking.status == status)
    if from_date is not None:
        stmt = stmt.where(Booking.to_date > from_date)
    if to_date is not None:
        stmt = stmt.where(Booking.from_date < to_date)

    items = list(
        (await session.execute(stmt.order_by(Booking.from_date.desc()))).scalars().all()
    )
    total = (
        await session.scalar(stmt.with_only_columns(func.count(Booking.booking_id)))
    ) or 0
    return BookingList(items=items, total=total)


@router.get(
    "/bookings/{booking_id}",
    response_model=BookingOut,
    operation_id="getBooking",
    summary="Get a booking by id",
)
async def get_booking(
    booking_id: str,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    booking = await _load_booking(session, booking_id)
    await _authorize_viewer(session, booking, current_user.user_id)
    return booking


@router.delete(
    "/bookings/{booking_id}",
    response_model=BookingOut,
    operation_id="cancelBooking",
    summary="Cancel a booking",
)
async def cancel_booking(
    booking_id: str,
    session: SessionDep,
    current_user: CurrentUserDep,
    body: BookingCancelIn | None = None,
):
    booking = await _load_booking(session, booking_id)

    role = await _resolve_role(session, booking, current_user.user_id)
    if role is None:
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(UTC)
    # cancellation allowed until start; matches the v1 decision
    if now >= booking.from_date:
        raise HTTPException(status_code=409, detail="Booking has already started")

    new_status = "cancelled_by_visitor" if role == "visitor" else "cancelled_by_host"
    reason = body.reason if body is not None and role != "visitor" else None

    # atomic flip so racing cancels don't clobber each other's cancelled_by
    result = await session.execute(
        update(Booking)
        .where(Booking.booking_id == booking_id, Booking.status == "confirmed")
        .values(
            status=new_status,
            cancelled_by=current_user.user_id,
            cancelled_at=now,
            cancel_reason=reason,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=409, detail="Booking is not cancellable")
    await session.commit()
    await session.refresh(booking)
    return booking


# --- host views ---


@router.get(
    "/berths/{berth_id}/bookings",
    response_model=BookingList,
    operation_id="listBerthBookings",
    summary="List bookings on a berth (spot-owner or harbormaster)",
)
async def list_berth_bookings(
    berth_id: str,
    session: SessionDep,
    current_user: CurrentUserDep,
    status: str | None = Query(None),  # noqa: B008
    from_date: datetime | None = Query(None, alias="from"),  # noqa: B008
    to_date: datetime | None = Query(None, alias="to"),  # noqa: B008
):
    harbor_id = await harbor_id_from_berth(berth_id, session)
    is_owner = await _is_spot_owner(session, berth_id, current_user.user_id)
    is_hm = await _is_harbormaster(session, harbor_id, current_user.user_id)
    if not (is_owner or is_hm):
        raise HTTPException(status_code=403, detail="Forbidden")

    stmt = select(Booking).where(Booking.berth_id == berth_id)
    if status:
        stmt = stmt.where(Booking.status == status)
    if from_date is not None:
        stmt = stmt.where(Booking.to_date > from_date)
    if to_date is not None:
        stmt = stmt.where(Booking.from_date < to_date)

    items = list(
        (await session.execute(stmt.order_by(Booking.from_date.desc()))).scalars().all()
    )
    total = (
        await session.scalar(stmt.with_only_columns(func.count(Booking.booking_id)))
    ) or 0
    return BookingList(items=items, total=total)


@router.get(
    "/harbors/{harbor_id}/bookings",
    response_model=BookingList,
    operation_id="listHarborBookings",
    summary="List bookings in a harbor (harbormaster only)",
)
async def list_harbor_bookings(
    harbor_id: str,
    session: SessionDep,
    current_user: CurrentUserDep,
    status: str | None = Query(None),  # noqa: B008
    dock_id: str | None = Query(None),  # noqa: B008
    from_date: datetime | None = Query(None, alias="from"),  # noqa: B008
    to_date: datetime | None = Query(None, alias="to"),  # noqa: B008
):
    await require_harbor_authority(current_user, harbor_id, session)

    stmt = (
        select(Booking)
        .join(Berth, Berth.berth_id == Booking.berth_id)
        .join(Dock, Dock.dock_id == Berth.dock_id)
        .where(Dock.harbor_id == harbor_id)
    )
    if dock_id:
        stmt = stmt.where(Berth.dock_id == dock_id)
    if status:
        stmt = stmt.where(Booking.status == status)
    if from_date is not None:
        stmt = stmt.where(Booking.to_date > from_date)
    if to_date is not None:
        stmt = stmt.where(Booking.from_date < to_date)

    items = list(
        (await session.execute(stmt.order_by(Booking.from_date.desc()))).scalars().all()
    )
    total = (
        await session.scalar(stmt.with_only_columns(func.count(Booking.booking_id)))
    ) or 0
    return BookingList(items=items, total=total)


# --- authorization helpers ---


async def _resolve_role(session, booking: Booking, user_id: str) -> str | None:
    """Returns 'visitor' | 'host' | None for the actor on this booking."""
    if booking.user_id == user_id:
        return "visitor"
    harbor_id = await harbor_id_from_berth(booking.berth_id, session)
    if await _is_harbormaster(session, harbor_id, user_id):
        return "host"
    if await _is_spot_owner(session, booking.berth_id, user_id):
        return "host"
    return None


async def _authorize_viewer(session, booking: Booking, user_id: str) -> None:
    if await _resolve_role(session, booking, user_id) is None:
        raise HTTPException(status_code=403, detail="Forbidden")

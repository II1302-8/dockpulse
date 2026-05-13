"""shared response serializers"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import user_is_harbormaster
from app.models import Assignment, Berth, BerthAvailabilityWindow, User, UserHarborRole
from app.schemas import AssignmentOut, BerthOut, UserOut


async def berths_with_active_windows(
    session: AsyncSession, berth_ids: list[str], now: datetime | None = None
) -> set[str]:
    """return the subset of berth_ids that have an availability window
    covering `now`. used to compute BerthOut.is_available_now in one query"""
    if not berth_ids:
        return set()
    moment = now or datetime.now(UTC)
    result = await session.execute(
        select(BerthAvailabilityWindow.berth_id)
        .where(
            BerthAvailabilityWindow.berth_id.in_(berth_ids),
            BerthAvailabilityWindow.from_date <= moment,
            BerthAvailabilityWindow.return_date > moment,
        )
        .distinct()
    )
    return set(result.scalars().all())


def _is_available_now(berth: Berth, has_active_window: bool) -> bool:
    # red when sensor sees a boat, or owner has it reserved with no window
    # punching a hole for visitors right now
    if berth.status == "occupied":
        return False
    return not (berth.is_reserved and not has_active_window)


def serialize_berth(berth: Berth, *, has_active_window: bool) -> BerthOut:
    assignment = (
        AssignmentOut(
            berth_id=berth.assignment.berth_id,
            user_id=berth.assignment.user_id,
        )
        if "assignment" in berth.__dict__ and berth.assignment is not None
        else None
    )
    return BerthOut(
        berth_id=berth.berth_id,
        dock_id=berth.dock_id,
        label=berth.label,
        length_m=berth.length_m,
        width_m=berth.width_m,
        depth_m=berth.depth_m,
        status=berth.status,  # type: ignore[arg-type]
        is_reserved=berth.is_reserved,
        is_available_now=_is_available_now(berth, has_active_window),
        sensor_raw=berth.sensor_raw,
        battery_pct=berth.battery_pct,
        last_updated=berth.last_updated,
        assignment=assignment,
    )


async def serialize_berths(
    session: AsyncSession, berths: list[Berth]
) -> list[BerthOut]:
    active = await berths_with_active_windows(session, [b.berth_id for b in berths])
    return [serialize_berth(b, has_active_window=b.berth_id in active) for b in berths]


async def assigned_berth_id(session: AsyncSession, user_id: str) -> str | None:
    # boat owner has at most one assignment in v1, pick first deterministically
    result = await session.execute(
        select(Assignment.berth_id)
        .where(Assignment.user_id == user_id)
        .order_by(Assignment.berth_id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def first_managed_harbor_id(session: AsyncSession, user_id: str) -> str | None:
    # harbormaster: pick the lowest harbor_id deterministically so FE urls stay
    # stable across reloads
    result = await session.execute(
        select(UserHarborRole.harbor_id)
        .where(
            UserHarborRole.user_id == user_id,
            UserHarborRole.role == "harbormaster",
        )
        .order_by(UserHarborRole.harbor_id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def to_user_out(
    session: AsyncSession,
    user: User,
    berth_id: str | None = None,
) -> UserOut:
    if berth_id is None:
        berth_id = await assigned_berth_id(session, user.user_id)
    role = "harbormaster" if await user_is_harbormaster(user, session) else "boat_owner"
    harbor_id = (
        await first_managed_harbor_id(session, user.user_id)
        if role == "harbormaster"
        else None
    )
    return UserOut.model_validate(
        {
            "user_id": user.user_id,
            "firstname": user.firstname,
            "lastname": user.lastname,
            "email": user.email,
            "phone": user.phone,
            "boat_club": user.boat_club,
            "role": role,
            "email_verified": user.email_verified,
            "assigned_berth_id": berth_id,
            "harbor_id": harbor_id,
        }
    )

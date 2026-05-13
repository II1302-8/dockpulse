"""shared response serializers"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import user_is_harbormaster
from app.models import Assignment, User, UserHarborRole
from app.schemas import UserOut


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

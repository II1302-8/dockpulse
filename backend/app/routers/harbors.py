from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import or_, select, union

from app.dependencies import (
    CurrentUserDep,
    HarbormasterForHarborDep,
    SessionDep,
)
from app.models import (
    Assignment,
    Berth,
    BerthAvailabilityWindow,
    Dock,
    Harbor,
    User,
)
from app.schemas import HarborOut, UserSearchOut

router = APIRouter(prefix="/api/harbors", tags=["harbors"])


@router.get(
    "",
    response_model=list[HarborOut],
    operation_id="listHarbors",
    summary="List all harbors",
)
async def list_harbors(
    _: CurrentUserDep,
    session: SessionDep,
) -> list[HarborOut]:
    stmt = select(Harbor).order_by(Harbor.name)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get(
    "/{harbor_id}/users",
    response_model=list[UserSearchOut],
    operation_id="searchHarborUsers",
    summary="Search users known to this harbor (harbormaster only)",
)
async def search_harbor_users(
    harbor_id: str,
    session: SessionDep,
    _: HarbormasterForHarborDep,
    q: Annotated[
        str | None,
        Query(
            description="email or name prefix, case-insensitive",
            max_length=120,
        ),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
):
    # users "known to the harbor" = anyone with a current assignment to a
    # berth in this harbor or an availability window scheduled here. avoids
    # global email enumeration while still surfacing realistic invite targets
    assignment_user_ids = (
        select(Assignment.user_id)
        .join(Berth, Berth.berth_id == Assignment.berth_id)
        .join(Dock, Dock.dock_id == Berth.dock_id)
        .where(Dock.harbor_id == harbor_id)
    )
    window_user_ids = (
        select(BerthAvailabilityWindow.user_id)
        .join(Berth, Berth.berth_id == BerthAvailabilityWindow.berth_id)
        .join(Dock, Dock.dock_id == Berth.dock_id)
        .where(Dock.harbor_id == harbor_id)
    )
    known_user_ids = union(assignment_user_ids, window_user_ids).subquery()

    stmt = (
        select(User)
        .join(known_user_ids, known_user_ids.c.user_id == User.user_id)
        .order_by(User.email)
        .limit(limit)
    )
    if q:
        prefix = f"{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                User.email.ilike(prefix),
                User.firstname.ilike(prefix),
                User.lastname.ilike(prefix),
            )
        )

    rows = (await session.execute(stmt)).scalars().all()
    return rows

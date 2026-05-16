from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_optional_user
from app.db import get_session
from app.models import (
    AdoptionRequest,
    Assignment,
    Berth,
    Booking,
    Dock,
    Gateway,
    Node,
    User,
    UserHarborRole,
)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]
OptionalUserDep = Annotated[User | None, Depends(get_optional_user)]


async def require_harbor_authority(
    user: CurrentUserDep, harbor_id: str, session: SessionDep
) -> User:
    row = await session.execute(
        select(UserHarborRole.user_id).where(
            UserHarborRole.user_id == user.user_id,
            UserHarborRole.harbor_id == harbor_id,
            UserHarborRole.role == "harbormaster",
        )
    )
    if row.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="Not authorized for this harbor")
    return user


async def is_harbor_member(
    user: User | None, harbor_id: str, session: AsyncSession
) -> bool:
    # membership = harbormaster role / Assignment / Booking (any status).
    # gates telemetry + assignment.user_id on otherwise-public berth reads
    if user is None:
        return False
    hm = await session.execute(
        select(UserHarborRole.user_id).where(
            UserHarborRole.user_id == user.user_id,
            UserHarborRole.harbor_id == harbor_id,
            UserHarborRole.role == "harbormaster",
        )
    )
    if hm.scalar_one_or_none() is not None:
        return True
    assigned = await session.execute(
        select(Assignment.berth_id)
        .join(Berth, Berth.berth_id == Assignment.berth_id)
        .join(Dock, Dock.dock_id == Berth.dock_id)
        .where(Assignment.user_id == user.user_id, Dock.harbor_id == harbor_id)
        .limit(1)
    )
    if assigned.scalar_one_or_none() is not None:
        return True
    booked = await session.execute(
        select(Booking.booking_id)
        .join(Berth, Berth.berth_id == Booking.berth_id)
        .join(Dock, Dock.dock_id == Berth.dock_id)
        .where(Booking.user_id == user.user_id, Dock.harbor_id == harbor_id)
        .limit(1)
    )
    return booked.scalar_one_or_none() is not None


async def require_any_harbormaster(user: CurrentUserDep, session: SessionDep) -> User:
    # 403 unless user has at least one harbormaster grant anywhere
    row = await session.execute(
        select(UserHarborRole.user_id)
        .where(
            UserHarborRole.user_id == user.user_id,
            UserHarborRole.role == "harbormaster",
        )
        .limit(1)
    )
    if row.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="Harbormaster role required")
    return user


async def user_managed_harbor_ids(user: User, session: AsyncSession) -> set[str]:
    result = await session.execute(
        select(UserHarborRole.harbor_id).where(
            UserHarborRole.user_id == user.user_id,
            UserHarborRole.role == "harbormaster",
        )
    )
    return set(result.scalars().all())


async def user_is_harbormaster(user: User, session: AsyncSession) -> bool:
    row = await session.execute(
        select(UserHarborRole.user_id)
        .where(
            UserHarborRole.user_id == user.user_id,
            UserHarborRole.role == "harbormaster",
        )
        .limit(1)
    )
    return row.scalar_one_or_none() is not None


async def harbor_id_from_berth(berth_id: str, session: SessionDep) -> str:
    row = await session.execute(
        select(Dock.harbor_id)
        .join(Berth, Berth.dock_id == Dock.dock_id)
        .where(Berth.berth_id == berth_id)
    )
    harbor_id = row.scalar_one_or_none()
    if harbor_id is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    return harbor_id


async def harbor_id_from_dock(dock_id: str, session: SessionDep) -> str:
    row = await session.execute(select(Dock.harbor_id).where(Dock.dock_id == dock_id))
    harbor_id = row.scalar_one_or_none()
    if harbor_id is None:
        raise HTTPException(status_code=404, detail="Dock not found")
    return harbor_id


async def harbor_id_from_gateway(gateway_id: str, session: SessionDep) -> str:
    row = await session.execute(
        select(Dock.harbor_id)
        .join(Gateway, Gateway.dock_id == Dock.dock_id)
        .where(Gateway.gateway_id == gateway_id)
    )
    harbor_id = row.scalar_one_or_none()
    if harbor_id is None:
        raise HTTPException(status_code=404, detail="Gateway not found")
    return harbor_id


async def harbor_id_from_node(node_id: str, session: SessionDep) -> str:
    row = await session.execute(
        select(Dock.harbor_id)
        .join(Berth, Berth.dock_id == Dock.dock_id)
        .join(Node, Node.berth_id == Berth.berth_id)
        .where(Node.node_id == node_id)
    )
    harbor_id = row.scalar_one_or_none()
    if harbor_id is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return harbor_id


async def harbor_id_from_adoption_request(request_id: str, session: SessionDep) -> str:
    row = await session.execute(
        select(Dock.harbor_id)
        .join(Berth, Berth.dock_id == Dock.dock_id)
        .join(AdoptionRequest, AdoptionRequest.berth_id == Berth.berth_id)
        .where(AdoptionRequest.request_id == request_id)
    )
    harbor_id = row.scalar_one_or_none()
    if harbor_id is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")
    return harbor_id


async def require_harbormaster_for_harbor(
    user: CurrentUserDep,
    session: SessionDep,
    harbor_id: str,
) -> User:
    return await require_harbor_authority(user, harbor_id, session)


async def require_harbormaster_for_berth(
    user: CurrentUserDep,
    session: SessionDep,
    harbor_id: Annotated[str, Depends(harbor_id_from_berth)],
) -> User:
    return await require_harbor_authority(user, harbor_id, session)


async def require_harbormaster_for_dock(
    user: CurrentUserDep,
    session: SessionDep,
    harbor_id: Annotated[str, Depends(harbor_id_from_dock)],
) -> User:
    return await require_harbor_authority(user, harbor_id, session)


async def require_harbormaster_for_gateway(
    user: CurrentUserDep,
    session: SessionDep,
    harbor_id: Annotated[str, Depends(harbor_id_from_gateway)],
) -> User:
    return await require_harbor_authority(user, harbor_id, session)


async def require_harbormaster_for_node(
    user: CurrentUserDep,
    session: SessionDep,
    harbor_id: Annotated[str, Depends(harbor_id_from_node)],
) -> User:
    return await require_harbor_authority(user, harbor_id, session)


async def require_harbormaster_for_adoption_request(
    user: CurrentUserDep,
    session: SessionDep,
    harbor_id: Annotated[str, Depends(harbor_id_from_adoption_request)],
) -> User:
    return await require_harbor_authority(user, harbor_id, session)


HarbormasterForHarborDep = Annotated[User, Depends(require_harbormaster_for_harbor)]
HarbormasterForBerthDep = Annotated[User, Depends(require_harbormaster_for_berth)]
HarbormasterForDockDep = Annotated[User, Depends(require_harbormaster_for_dock)]
HarbormasterForGatewayDep = Annotated[User, Depends(require_harbormaster_for_gateway)]
HarbormasterForNodeDep = Annotated[User, Depends(require_harbormaster_for_node)]
HarbormasterForAdoptionRequestDep = Annotated[
    User, Depends(require_harbormaster_for_adoption_request)
]
AnyHarbormasterDep = Annotated[User, Depends(require_any_harbormaster)]

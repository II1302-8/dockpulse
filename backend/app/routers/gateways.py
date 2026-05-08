from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.dependencies import AnyHarbormasterDep, SessionDep, user_managed_harbor_ids
from app.models import Dock, Gateway, PendingGateway
from app.schemas import GatewayOut, PendingGatewayOut

router = APIRouter(prefix="/api/gateways", tags=["gateways"])


@router.get(
    "",
    response_model=list[GatewayOut],
    operation_id="listGateways",
    summary="List gateways visible to the harbormaster",
)
async def list_gateways(
    user: AnyHarbormasterDep,
    session: SessionDep,
    harbor_id: str | None = Query(None, description="Filter by harbor"),
    dock_id: str | None = Query(None, description="Filter by dock"),
    status: str | None = Query(
        None,
        description="Filter by gateway status",
        pattern="^(online|offline)$",
    ),
) -> list[GatewayOut]:
    managed = await user_managed_harbor_ids(user, session)
    if not managed:
        return []
    stmt = (
        select(Gateway)
        .join(Dock, Dock.dock_id == Gateway.dock_id)
        .where(Dock.harbor_id.in_(managed))
    )
    if dock_id:
        stmt = stmt.where(Gateway.dock_id == dock_id)
    if harbor_id:
        stmt = stmt.where(Dock.harbor_id == harbor_id)
    if status:
        stmt = stmt.where(Gateway.status == status)
    stmt = stmt.order_by(Gateway.gateway_id)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get(
    "/pending",
    response_model=list[PendingGatewayOut],
    operation_id="listPendingGateways",
    summary="List unknown gateway ids seen on MQTT",
)
async def list_pending_gateways(
    user: AnyHarbormasterDep, session: SessionDep
) -> list[PendingGatewayOut]:
    # global list, pending rows precede dock association
    result = await session.execute(
        select(PendingGateway).order_by(PendingGateway.last_seen_at.desc())
    )
    return result.scalars().all()


@router.delete(
    "/pending/{gateway_id}",
    status_code=204,
    operation_id="dismissPendingGateway",
    summary="Dismiss a pending gateway entry",
)
async def dismiss_pending_gateway(
    gateway_id: str, user: AnyHarbormasterDep, session: SessionDep
) -> None:
    row = await session.get(PendingGateway, gateway_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Pending gateway not found")
    await session.delete(row)
    await session.commit()

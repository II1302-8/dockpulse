from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.dependencies import CurrentUserDep, SessionDep, user_managed_harbor_ids
from app.models import Dock, Gateway
from app.schemas import GatewayOut

router = APIRouter(prefix="/api/gateways", tags=["gateways"])


@router.get(
    "",
    response_model=list[GatewayOut],
    operation_id="listGateways",
    summary="List gateways visible to the harbormaster",
)
async def list_gateways(
    user: CurrentUserDep,
    session: SessionDep,
    harbor_id: str | None = Query(None, description="Filter by harbor"),
    dock_id: str | None = Query(None, description="Filter by dock"),
    status: str | None = Query(
        None,
        description="Filter by gateway status",
        pattern="^(online|offline)$",
    ),
) -> list[GatewayOut]:
    if user.role != "harbormaster":
        raise HTTPException(status_code=403, detail="Harbormaster role required")
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

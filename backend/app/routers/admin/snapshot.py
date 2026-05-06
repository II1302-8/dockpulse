"""aggregate of dpcli list-* state, single fetch for the spa dashboard"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.dependencies import SessionDep
from app.models import AdoptionRequest, Gateway, Node, PendingGateway

router = APIRouter()


class SnapshotGateway(BaseModel):
    gateway_id: str
    dock_id: str
    name: str
    status: str = Field(examples=["online"])
    last_seen: datetime | None = None
    provision_ttl_s: int | None = None


class SnapshotNode(BaseModel):
    node_id: str
    berth_id: str
    gateway_id: str
    status: str = Field(examples=["provisioned"])
    adopted_at: datetime | None = None


class SnapshotPending(BaseModel):
    gateway_id: str
    first_seen_at: datetime
    last_seen_at: datetime
    attempts: int


class SnapshotAdoption(BaseModel):
    pending: int
    err_last_15min: int


class SnapshotOut(BaseModel):
    gateways: list[SnapshotGateway]
    nodes: list[SnapshotNode]
    pending_gateways: list[SnapshotPending]
    adoption: SnapshotAdoption


@router.get(
    "/snapshot",
    response_model=SnapshotOut,
    operation_id="adminSnapshot",
    summary="Aggregate state across the gateway/node/adoption pipeline",
)
async def snapshot(session: SessionDep) -> dict:
    cutoff = datetime.now(UTC) - timedelta(minutes=15)

    gateways = (
        (await session.execute(select(Gateway).order_by(Gateway.gateway_id)))
        .scalars()
        .all()
    )
    nodes = (await session.execute(select(Node).order_by(Node.node_id))).scalars().all()
    pending_gateways = (
        (
            await session.execute(
                select(PendingGateway).order_by(PendingGateway.last_seen_at.desc())
            )
        )
        .scalars()
        .all()
    )
    pending_adoptions_count = (
        await session.scalar(
            select(func.count())
            .select_from(AdoptionRequest)
            .where(AdoptionRequest.status == "pending")
        )
    ) or 0
    err_last_15min = (
        await session.scalar(
            select(func.count())
            .select_from(AdoptionRequest)
            .where(
                AdoptionRequest.status == "err",
                AdoptionRequest.completed_at >= cutoff,
            )
        )
    ) or 0

    return {
        "gateways": [
            {
                "gateway_id": g.gateway_id,
                "dock_id": g.dock_id,
                "name": g.name,
                "status": g.status,
                "last_seen": g.last_seen.isoformat() if g.last_seen else None,
                "provision_ttl_s": g.provision_ttl_s,
            }
            for g in gateways
        ],
        "nodes": [
            {
                "node_id": n.node_id,
                "berth_id": n.berth_id,
                "gateway_id": n.gateway_id,
                "status": n.status,
                "adopted_at": n.adopted_at.isoformat() if n.adopted_at else None,
            }
            for n in nodes
        ],
        "pending_gateways": [
            {
                "gateway_id": p.gateway_id,
                "first_seen_at": p.first_seen_at.isoformat(),
                "last_seen_at": p.last_seen_at.isoformat(),
                "attempts": p.attempts,
            }
            for p in pending_gateways
        ],
        "adoption": {
            "pending": pending_adoptions_count,
            "err_last_15min": err_last_15min,
        },
    }

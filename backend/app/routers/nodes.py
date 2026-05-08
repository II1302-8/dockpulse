import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

import aiomqtt
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.dependencies import (
    AnyHarbormasterDep,
    HarbormasterForNodeDep,
    SessionDep,
    user_managed_harbor_ids,
)
from app.models import Berth, Dock, Event, Node
from app.mqtt import MqttNotConnectedError, publish_decommission_req
from app.schemas import NodeDetailOut, NodeHealthOut

router = APIRouter(prefix="/api/nodes", tags=["nodes"])

# matches mqtt-contract.yml, heartbeat every 5 min, offline after 3x interval
STALE_AFTER = timedelta(minutes=5)
OFFLINE_AFTER = timedelta(minutes=15)
RECENT_EVENTS_LIMIT = 50


HealthLiteral = Literal["online", "stale", "offline", "decommissioned"]


def _derive_health(
    node_status: str, last_seen: datetime | None, now: datetime
) -> HealthLiteral:
    if node_status == "decommissioned":
        return "decommissioned"
    if last_seen is None:
        return "offline"
    age = now - last_seen
    if age >= OFFLINE_AFTER:
        return "offline"
    if age >= STALE_AFTER:
        return "stale"
    return "online"


def _to_health_out(node: Node, berth: Berth | None, now: datetime) -> dict:
    last_seen = berth.last_updated if berth else None
    battery_pct = berth.battery_pct if berth else None
    return {
        "node_id": node.node_id,
        "serial_number": node.serial_number,
        "berth_id": node.berth_id,
        "gateway_id": node.gateway_id,
        "mesh_unicast_addr": node.mesh_unicast_addr,
        "adopted_at": node.adopted_at,
        "health": _derive_health(node.status, last_seen, now),
        "battery_pct": battery_pct,
        "last_seen": last_seen,
    }


@router.get(
    "",
    response_model=list[NodeHealthOut],
    operation_id="listNodes",
    summary="List nodes with derived health",
)
async def list_nodes(
    user: AnyHarbormasterDep,
    session: SessionDep,
    gateway_id: Annotated[str | None, Query(description="Filter by gateway")] = None,
    berth_id: Annotated[str | None, Query(description="Filter by berth")] = None,
    health: Annotated[
        HealthLiteral | None, Query(description="Filter by health")
    ] = None,
) -> list[dict]:
    managed = await user_managed_harbor_ids(user, session)
    if not managed:
        return []
    stmt = (
        select(Node)
        .join(Berth, Berth.berth_id == Node.berth_id)
        .join(Dock, Dock.dock_id == Berth.dock_id)
        .where(Dock.harbor_id.in_(managed))
    )
    if gateway_id:
        stmt = stmt.where(Node.gateway_id == gateway_id)
    if berth_id:
        stmt = stmt.where(Node.berth_id == berth_id)
    stmt = stmt.order_by(Node.adopted_at.desc())
    nodes = (await session.execute(stmt)).scalars().all()

    if not nodes:
        return []

    berth_stmt = select(Berth).where(Berth.berth_id.in_({n.berth_id for n in nodes}))
    berths_by_id = {
        b.berth_id: b for b in (await session.execute(berth_stmt)).scalars().all()
    }

    now = datetime.now(UTC)
    rows = [_to_health_out(n, berths_by_id.get(n.berth_id), now) for n in nodes]
    if health:
        rows = [r for r in rows if r["health"] == health]
    return rows


@router.get(
    "/{node_id}",
    response_model=NodeDetailOut,
    operation_id="getNode",
    summary="Get node detail with recent telemetry",
)
async def get_node(
    node_id: str,
    _: HarbormasterForNodeDep,
    session: SessionDep,
    events_limit: Annotated[int, Query(ge=1, le=500)] = RECENT_EVENTS_LIMIT,
) -> dict:
    node = await session.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    berth = await session.get(Berth, node.berth_id)
    now = datetime.now(UTC)
    base = _to_health_out(node, berth, now)

    events_stmt = (
        select(Event)
        .where(Event.berth_id == node.berth_id)
        .order_by(Event.timestamp.desc())
        .limit(events_limit)
    )
    events = (await session.execute(events_stmt)).scalars().all()
    base["recent_events"] = events
    return base


@router.post(
    "/{node_id}/decommission",
    response_model=NodeHealthOut,
    operation_id="decommissionNode",
    summary="Mark node as decommissioned",
)
async def decommission_node(
    node_id: str,
    _: HarbormasterForNodeDep,
    session: SessionDep,
) -> dict:
    node = await session.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    # idempotent, skip publish + commit if already decommissioned
    if node.status != "decommissioned":
        # publish first, flip db only on broker ack so mesh + db can't diverge
        try:
            await publish_decommission_req(
                gateway_id=node.gateway_id,
                request_id=str(uuid.uuid4()),
                node_id=node.node_id,
                unicast_addr=node.mesh_unicast_addr,
                berth_id=node.berth_id,
            )
        except (MqttNotConnectedError, aiomqtt.MqttError) as exc:
            raise HTTPException(
                status_code=503,
                detail=f"decommission/req not delivered to gateway: {exc}",
            ) from exc
        node.status = "decommissioned"
        await session.commit()
        await session.refresh(node)

    berth = await session.get(Berth, node.berth_id)
    return _to_health_out(node, berth, datetime.now(UTC))

"""Admin endpoints for the per-env admin SPA at admin.<env>.dockpulse.xyz.

Auth is Cloudflare Access (Zero Trust): the SPA is behind a CF tunnel + Access
policy, and CF attaches a signed JWT in the Cf-Access-Jwt-Assertion header on
every request. This router validates that assertion instead of using the
harbormaster cookie path, so admins are decoupled from the user/role table.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from app.adoption.finalize import complete_adoption_err
from app.adoption.sweeper import prune_old_errors, sweep_once
from app.cf_access import HEADER, AccessAuthError, AccessIdentity, verify_assertion
from app.dependencies import SessionDep
from app.models import AdoptionRequest, Dock, Gateway, Node, PendingGateway
from app.mqtt import publish_decommission_req

logger = logging.getLogger(__name__)


async def require_cf_access(
    cf_jwt: Annotated[str | None, Header(alias=HEADER)] = None,
) -> AccessIdentity:
    if cf_jwt is None:
        # 401 with a body that says exactly which header is missing helps
        # operators wire the tunnel quickly
        raise HTTPException(
            status_code=401,
            detail=(
                f"Missing {HEADER} header (request must come through Cloudflare Access)"
            ),
        )
    try:
        identity = verify_assertion(cf_jwt)
    except AccessAuthError as err:
        raise HTTPException(status_code=401, detail=str(err)) from err
    logger.info("admin request from %s", identity.email)
    return identity


CfAccessDep = Annotated[AccessIdentity, Depends(require_cf_access)]

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_cf_access)],
)


@router.get(
    "/snapshot",
    operation_id="adminSnapshot",
    summary="Aggregate state across the gateway/node/adoption pipeline",
)
async def snapshot(session: SessionDep) -> dict:
    """One-shot view that reflects what dpcli list-* commands return,
    suitable for the admin SPA's landing dashboard."""
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
        or 0
    )
    err_last_15min = (
        await session.scalar(
            select(func.count())
            .select_from(AdoptionRequest)
            .where(
                AdoptionRequest.status == "err",
                AdoptionRequest.completed_at >= cutoff,
            )
        )
        or 0
    )

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


# ---- gateways ----


class GatewayCreate(BaseModel):
    gateway_id: str = Field(min_length=1, max_length=64)
    dock_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)


class GatewayPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    provision_ttl_s: int | None = Field(default=None, ge=10, le=3600)


@router.post("/gateways", operation_id="adminCreateGateway", status_code=201)
async def create_gateway(body: GatewayCreate, session: SessionDep) -> dict:
    if await session.get(Dock, body.dock_id) is None:
        raise HTTPException(status_code=404, detail=f"Dock {body.dock_id} not found")
    if await session.get(Gateway, body.gateway_id) is not None:
        raise HTTPException(
            status_code=409, detail=f"Gateway {body.gateway_id} already exists"
        )
    # one-gateway-per-dock invariant
    clash = (
        await session.execute(select(Gateway).where(Gateway.dock_id == body.dock_id))
    ).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Dock {body.dock_id} already has gateway {clash.gateway_id}",
        )
    gw = Gateway(
        gateway_id=body.gateway_id,
        dock_id=body.dock_id,
        name=body.name,
        status="offline",
    )
    session.add(gw)
    # if it was a known pending id, clear that row so it doesn't keep showing up
    pending = await session.get(PendingGateway, body.gateway_id)
    if pending is not None:
        await session.delete(pending)
    await session.commit()
    return {"gateway_id": gw.gateway_id, "status": gw.status}


@router.patch("/gateways/{gateway_id}", operation_id="adminPatchGateway")
async def patch_gateway(
    gateway_id: str, body: GatewayPatch, session: SessionDep
) -> dict:
    gw = await session.get(Gateway, gateway_id)
    if gw is None:
        raise HTTPException(status_code=404, detail="Gateway not found")
    if body.name is not None:
        gw.name = body.name
    if body.provision_ttl_s is not None:
        gw.provision_ttl_s = body.provision_ttl_s
    await session.commit()
    return {
        "gateway_id": gw.gateway_id,
        "name": gw.name,
        "provision_ttl_s": gw.provision_ttl_s,
    }


@router.delete(
    "/gateways/pending/{gateway_id}",
    operation_id="adminDismissPending",
    status_code=204,
)
async def dismiss_pending(gateway_id: str, session: SessionDep) -> None:
    row = await session.get(PendingGateway, gateway_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Pending gateway not found")
    await session.delete(row)
    await session.commit()


# ---- nodes ----


@router.post(
    "/nodes/{node_id}/decommission",
    operation_id="adminDecommissionNode",
)
async def decommission_node(node_id: str, session: SessionDep) -> dict:
    node = await session.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status == "decommissioned":
        return {"node_id": node_id, "status": "decommissioned", "noop": True}
    node.status = "decommissioned"
    await session.commit()
    await publish_decommission_req(
        gateway_id=node.gateway_id,
        request_id=str(uuid.uuid4()),
        node_id=node.node_id,
        unicast_addr=node.mesh_unicast_addr,
        berth_id=node.berth_id,
    )
    return {"node_id": node_id, "status": "decommissioned", "noop": False}


# ---- adoptions ----


@router.post(
    "/adoptions/{request_id}/cancel",
    operation_id="adminCancelAdoption",
)
async def cancel_adoption(request_id: str, session: SessionDep) -> dict:
    request = await session.get(AdoptionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")
    if request.status != "pending":
        return {
            "request_id": request_id,
            "status": request.status,
            "error_code": request.error_code,
        }
    await complete_adoption_err(session, request_id=request_id, error_code="cancelled")
    await session.refresh(request)
    return {
        "request_id": request.request_id,
        "status": request.status,
        "error_code": request.error_code,
    }


@router.delete(
    "/adoptions",
    operation_id="adminBulkDeleteAdoptions",
)
async def bulk_delete_adoptions(session: SessionDep, status: str = "err") -> dict:
    """Delete adoption_requests rows by status. Default 'err'; pass 'pending' to
    cancel-and-delete, or 'all' for a full wipe (use sparingly)."""
    if status == "all":
        result = await session.execute(delete(AdoptionRequest))
    elif status in {"err", "pending", "ok"}:
        result = await session.execute(
            delete(AdoptionRequest).where(AdoptionRequest.status == status)
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="status must be one of 'err', 'pending', 'ok', 'all'",
        )
    await session.commit()
    return {"deleted": result.rowcount or 0, "status_filter": status}


# ---- sweeper ----


@router.post(
    "/sweeper/run",
    operation_id="adminRunSweeper",
    summary="Force a sweeper iteration (timeout expired pendings + prune old errs)",
)
async def run_sweeper(session: SessionDep) -> dict:
    expired = await sweep_once(session)
    pruned = await prune_old_errors(session)
    return {"expired": expired, "pruned": pruned}

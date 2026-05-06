"""Admin endpoints for the per-env admin SPA at admin.<env>.dockpulse.xyz.

Auth is Cloudflare Access (Zero Trust): the SPA is behind a CF tunnel + Access
policy, and CF attaches a signed JWT in the Cf-Access-Jwt-Assertion header on
every request. This router validates that assertion instead of using the
harbormaster cookie path, so admins are decoupled from the user/role table.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select

from app.cf_access import HEADER, AccessAuthError, AccessIdentity, verify_assertion
from app.dependencies import SessionDep
from app.models import AdoptionRequest, Gateway, Node, PendingGateway

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

import base64
import binascii
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.adoption.claims import ClaimError, FactoryClaim, verify_claim_jwt
from app.auth import get_current_user
from app.db import get_session
from app.models import AdoptionRequest, Berth, Gateway, Node, User
from app.schemas import AdoptIn, AdoptionRequestOut

router = APIRouter(prefix="/api/nodes", tags=["nodes"])
sessiondep = Annotated[AsyncSession, Depends(get_session)]
currentuser_dep = Annotated[User, Depends(get_current_user)]

ADOPTION_TTL = timedelta(seconds=60)


def _decode_qr_payload(payload: str) -> dict:
    """Decode the base64url-encoded JSON from a QR fragment"""
    padded = payload + "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded)
    except (binascii.Error, ValueError) as err:
        raise HTTPException(status_code=400, detail="Invalid QR encoding") from err
    try:
        data = json.loads(decoded)
    except json.JSONDecodeError as err:
        raise HTTPException(status_code=400, detail="Invalid QR JSON") from err
    if not isinstance(data, dict) or "jwt" not in data:
        raise HTTPException(status_code=400, detail="QR missing 'jwt' field")
    return data


def _verify_claim(qr: dict) -> FactoryClaim:
    try:
        return verify_claim_jwt(qr["jwt"])
    except ClaimError as err:
        raise HTTPException(status_code=400, detail=f"Invalid claim: {err}") from err


@router.post(
    "/adopt",
    response_model=AdoptionRequestOut,
    status_code=202,
    operation_id="adoptNode",
)
async def adopt_node(
    body: AdoptIn,
    current_user: currentuser_dep,
    session: sessiondep,
):
    if current_user.role != "harbormaster":
        raise HTTPException(status_code=403, detail="Harbormaster role required")

    qr = _decode_qr_payload(body.qr_payload)
    claim = _verify_claim(qr)

    gateway = await session.get(Gateway, body.gateway_id)
    if gateway is None:
        raise HTTPException(status_code=404, detail="Gateway not found")

    berth = await session.get(Berth, body.berth_id)
    if berth is None:
        raise HTTPException(status_code=404, detail="Berth not found")

    if gateway.dock_id != berth.dock_id:
        raise HTTPException(
            status_code=400, detail="Gateway does not serve this berth's dock"
        )

    active_node = await session.execute(
        select(Node).where(
            Node.berth_id == body.berth_id, Node.status != "decommissioned"
        )
    )
    if active_node.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Berth already has an active node")

    now = datetime.now(UTC)
    request = AdoptionRequest(
        request_id=str(uuid.uuid4()),
        mesh_uuid=claim.mesh_uuid,
        serial_number=claim.serial_number,
        claim_jti=claim.jti,
        gateway_id=body.gateway_id,
        berth_id=body.berth_id,
        expires_at=now + ADOPTION_TTL,
        status="pending",
        created_by_user_id=current_user.user_id,
        created_at=now,
    )
    session.add(request)
    try:
        await session.commit()
    except IntegrityError as err:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="Claim has already been used"
        ) from err

    await session.refresh(request)
    # TODO(MQTT): publish provision/req on dockpulse/v1/gw/{gateway_id}/provision/req
    return request

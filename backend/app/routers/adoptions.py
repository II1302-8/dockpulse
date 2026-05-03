import base64
import binascii
import json
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.adoption.claims import ClaimError, FactoryClaim, verify_claim_jwt
from app.dependencies import HarbormasterDep, SessionDep, require_harbormaster
from app.models import AdoptionRequest, Berth, Gateway, Node
from app.mqtt import publish_provision_req
from app.schemas import AdoptIn, AdoptionRequestOut

router = APIRouter(prefix="/api/adoptions", tags=["adoptions"])

ADOPTION_TTL = timedelta(seconds=60)


def _decode_qr_payload(payload: str) -> dict:
    """Decode base64url-encoded JSON from a QR fragment"""
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
    "",
    response_model=AdoptionRequestOut,
    status_code=202,
    operation_id="createAdoption",
    summary="Create an adoption request for a scanned node",
)
async def create_adoption(
    body: AdoptIn,
    current_user: HarbormasterDep,
    session: SessionDep,
):
    qr = _decode_qr_payload(body.qr_payload)
    claim = _verify_claim(qr)

    oob = qr.get("oob")
    if not isinstance(oob, str) or not oob:
        raise HTTPException(status_code=400, detail="QR missing 'oob' field")

    gateway = await session.get(Gateway, body.gateway_id)
    if gateway is None:
        raise HTTPException(status_code=404, detail="Gateway not found")
    if gateway.status != "online":
        raise HTTPException(status_code=409, detail="Gateway is offline")

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

    await publish_provision_req(
        gateway_id=body.gateway_id,
        request_id=request.request_id,
        mesh_uuid=claim.mesh_uuid,
        oob=oob,
        ttl_s=int(ADOPTION_TTL.total_seconds()),
    )
    return request


@router.get(
    "/{request_id}",
    response_model=AdoptionRequestOut,
    operation_id="getAdoption",
    summary="Get an adoption request by id",
    dependencies=[Depends(require_harbormaster)],
)
async def get_adoption(request_id: str, session: SessionDep):
    request = await session.get(AdoptionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")
    return request

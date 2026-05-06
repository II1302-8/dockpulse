import asyncio
import base64
import binascii
import json
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sse_starlette.sse import EventSourceResponse

from app import broadcaster
from app.adoption.claims import ClaimError, FactoryClaim, verify_claim_jwt
from app.adoption.finalize import complete_adoption_err
from app.config import get_settings
from app.dependencies import (
    CurrentUserDep,
    SessionDep,
    harbor_id_from_berth,
    require_harbor_authority,
    require_harbormaster_for_adoption_request,
)
from app.models import AdoptionRequest, Berth, Gateway, Node
from app.mqtt import publish_provision_req
from app.rate_limit import limiter
from app.schemas import (
    AdoptIn,
    AdoptionRequestOut,
    AdoptionStateEvent,
    AdoptionUpdateEvent,
)

router = APIRouter(prefix="/api/adoptions", tags=["adoptions"])

# 180s leaves headroom for retries on flaky gateway-to-node BLE handshake
ADOPTION_TTL = timedelta(seconds=180)
SSE_PING_SECONDS = 15


def _decode_qr_payload(payload: str) -> dict:
    """Decode base64url-encoded JSON from a QR fragment.

    Treats decode and JSON failures as 400. Pydantic's max_length on the
    field caps the input size before we get here, so this only handles
    the parse-error surface.
    """
    padded = payload + "=" * (-len(payload) % 4)
    # urlsafe variant has no validate flag, translate to std then b64decode
    # with validate=True so non-alphabet chars are rejected, not stripped
    try:
        as_std = padded.translate(str.maketrans({"-": "+", "_": "/"}))
        decoded = base64.b64decode(as_std, validate=True)
    except (binascii.Error, ValueError) as err:
        raise HTTPException(status_code=400, detail="Invalid QR encoding") from err
    try:
        # UnicodeDecodeError subclasses ValueError, caught alongside
        data = json.loads(decoded)
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
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
@limiter.limit(lambda: get_settings().rate_limit_adopt)
async def create_adoption(
    request: Request,
    body: AdoptIn,
    current_user: CurrentUserDep,
    session: SessionDep,
    response: Response,
):
    qr = _decode_qr_payload(body.qr_payload)
    claim = _verify_claim(qr)
    # oob comes from the signed claim, tampering with the outer QR field
    # has no effect since backend only reads the signed value
    oob = claim.oob_hex

    # role + harbor authority before any other lookups
    harbor_id = await harbor_id_from_berth(body.berth_id, session)
    await require_harbor_authority(current_user, harbor_id, session)

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

    ttl = (
        timedelta(seconds=gateway.provision_ttl_s)
        if gateway.provision_ttl_s
        else ADOPTION_TTL
    )
    now = datetime.now(UTC)

    # claim_jti UNIQUE bars duplicates. resolve by status:
    #   pending -> in-flight, return as-is (idempotent paste)
    #   ok      -> already adopted, real conflict
    #   err     -> recycle the row so user can retry with same QR (sticker
    #              is single-use). resets state and re-fires provision/req
    existing = (
        await session.execute(
            select(AdoptionRequest).where(AdoptionRequest.claim_jti == claim.jti)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.status == "pending":
            response.status_code = 200
            return existing
        if existing.status == "ok":
            raise HTTPException(status_code=409, detail="Claim has already been used")
        # err recycle in place
        existing.status = "pending"
        existing.error_code = None
        existing.error_msg = None
        existing.completed_at = None
        existing.mesh_unicast_addr = None
        existing.dev_key_fp = None
        existing.expires_at = now + ttl
        existing.gateway_id = body.gateway_id
        existing.berth_id = body.berth_id
        existing.created_by_user_id = current_user.user_id
        existing.created_at = now
        await session.commit()
        await session.refresh(existing)
        await publish_provision_req(
            gateway_id=body.gateway_id,
            request_id=existing.request_id,
            mesh_uuid=claim.mesh_uuid,
            oob=oob,
            ttl_s=int(ttl.total_seconds()),
            berth_id=body.berth_id,
        )
        response.status_code = 200
        return existing

    request = AdoptionRequest(
        request_id=str(uuid.uuid4()),
        mesh_uuid=claim.mesh_uuid,
        serial_number=claim.serial_number,
        claim_jti=claim.jti,
        gateway_id=body.gateway_id,
        berth_id=body.berth_id,
        expires_at=now + ttl,
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
        ttl_s=int(ttl.total_seconds()),
        berth_id=body.berth_id,
    )
    return request


@router.get(
    "/{request_id}",
    response_model=AdoptionRequestOut,
    operation_id="getAdoption",
    summary="Get an adoption request by id",
    dependencies=[Depends(require_harbormaster_for_adoption_request)],
)
async def get_adoption(request_id: str, session: SessionDep):
    request = await session.get(AdoptionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")
    return request


@router.get(
    "/{request_id}/stream",
    operation_id="streamAdoption",
    summary="Subscribe to adoption progress via Server-Sent Events",
    description=(
        "Opens a long-lived `text/event-stream` for a single adoption "
        "request. The first frame is a snapshot of the current state. "
        "Subsequent frames are `AdoptionUpdateEvent` (DB-backed terminal/"
        "snapshot transitions) or `AdoptionStateEvent` (advisory phase "
        "events forwarded from the gateway). The stream closes once the "
        "request reaches a terminal state (`ok` or `err`)."
    ),
    response_class=EventSourceResponse,
    responses={
        200: {
            "model": AdoptionUpdateEvent | AdoptionStateEvent,
            "description": (
                "Each frame is a JSON-encoded AdoptionUpdateEvent or "
                "AdoptionStateEvent."
            ),
        },
        404: {"description": "Adoption request not found"},
    },
    dependencies=[Depends(require_harbormaster_for_adoption_request)],
)
async def stream_adoption(request_id: str, request: Request, session: SessionDep):
    initial = await session.get(AdoptionRequest, request_id)
    if initial is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")

    async def event_gen():
        # subscribe before snapshot so finalize between them not lost
        async with broadcaster.subscribe() as queue:
            snapshot = AdoptionUpdateEvent(request=initial).model_dump(mode="json")
            yield {"event": snapshot["type"], "data": json.dumps(snapshot)}
            if initial.status != "pending":
                return
            while True:
                if await request.is_disconnected():
                    return
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                except TimeoutError:
                    continue
                etype = event.get("type")
                if etype == "adoption.state":
                    if event.get("request_id") != request_id:
                        continue
                    yield {"event": etype, "data": json.dumps(event)}
                    continue
                if etype != "adoption.update":
                    continue
                if event["request"]["request_id"] != request_id:
                    continue
                yield {"event": etype, "data": json.dumps(event)}
                if event["request"]["status"] != "pending":
                    return

    return EventSourceResponse(event_gen(), ping=SSE_PING_SECONDS)


@router.post(
    "/{request_id}/cancel",
    response_model=AdoptionRequestOut,
    operation_id="cancelAdoption",
    summary="Cancel a pending adoption request",
    dependencies=[Depends(require_harbormaster_for_adoption_request)],
)
async def cancel_adoption(request_id: str, session: SessionDep):
    request = await session.get(AdoptionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")
    if request.status != "pending":
        # already terminal, surface current state instead of erroring
        return request
    await complete_adoption_err(session, request_id=request_id, error_code="cancelled")
    await session.refresh(request)
    return request

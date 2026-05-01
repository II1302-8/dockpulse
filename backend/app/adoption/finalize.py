"""Adoption-request completion logic

Called by the MQTT response handler when a gateway reports the result of
a provisioning attempt
"""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import broadcaster
from app.models import AdoptionRequest, Node
from app.schemas import AdoptionRequestOut

logger = logging.getLogger(__name__)


def publish_adoption_update(request: AdoptionRequest) -> None:
    payload = {
        "type": "adoption.update",
        "request": AdoptionRequestOut.model_validate(request).model_dump(mode="json"),
    }
    broadcaster.publish(payload)


async def _load_pending(
    session: AsyncSession, request_id: str
) -> AdoptionRequest | None:
    stmt = (
        select(AdoptionRequest)
        .where(AdoptionRequest.request_id == request_id)
        .with_for_update()
    )
    request = (await session.execute(stmt)).scalar_one_or_none()
    if request is None:
        logger.info("provision response for unknown request_id=%s", request_id)
        return None
    if request.status != "pending":
        logger.info(
            "provision response for already-finalized request=%s status=%s",
            request_id,
            request.status,
        )
        return None
    return request


async def complete_adoption_ok(
    session: AsyncSession,
    *,
    request_id: str,
    mesh_unicast_addr: str,
    dev_key_fp: str,
) -> None:
    request = await _load_pending(session, request_id)
    if request is None:
        return

    now = datetime.now(UTC)
    request.status = "ok"
    request.mesh_unicast_addr = mesh_unicast_addr
    request.dev_key_fp = dev_key_fp
    request.completed_at = now

    node = Node(
        node_id=str(uuid.uuid4()),
        mesh_uuid=request.mesh_uuid,
        serial_number=request.serial_number,
        berth_id=request.berth_id,
        gateway_id=request.gateway_id,
        mesh_unicast_addr=mesh_unicast_addr,
        dev_key_fp=dev_key_fp,
        status="provisioned",
        adopted_at=now,
        adopted_by_user_id=request.created_by_user_id,
    )
    session.add(node)
    await session.commit()
    await session.refresh(request)
    publish_adoption_update(request)
    logger.info(
        "adoption ok: request=%s node=%s berth=%s",
        request_id,
        node.node_id,
        request.berth_id,
    )


async def complete_adoption_err(
    session: AsyncSession,
    *,
    request_id: str,
    error_code: str,
    error_msg: str | None = None,
) -> None:
    request = await _load_pending(session, request_id)
    if request is None:
        return

    request.status = "err"
    request.error_code = error_code
    request.error_msg = error_msg
    request.completed_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(request)
    publish_adoption_update(request)
    logger.info(
        "adoption err: request=%s code=%s msg=%s", request_id, error_code, error_msg
    )

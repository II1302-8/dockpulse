"""node decommission, mqtt publish then db flip"""

import uuid

import aiomqtt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.dependencies import SessionDep
from app.models import Node
from app.mqtt import MqttNotConnectedError, publish_decommission_req

router = APIRouter()


class DecommissionOut(BaseModel):
    node_id: str
    status: str
    noop: bool


@router.post(
    "/nodes/{node_id}/decommission",
    response_model=DecommissionOut,
    operation_id="adminDecommissionNode",
)
async def decommission_node(node_id: str, session: SessionDep) -> dict:
    node = await session.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status == "decommissioned":
        return {"node_id": node_id, "status": "decommissioned", "noop": True}
    # publish first so a broker outage can't leave db decommissioned but mesh live
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
    return {"node_id": node_id, "status": "decommissioned", "noop": False}


class ResendDecommissionOut(BaseModel):
    node_id: str
    request_id: str


@router.post(
    "/nodes/{node_id}/decommission/resend",
    response_model=ResendDecommissionOut,
    operation_id="adminResendDecommission",
)
async def resend_decommission(node_id: str, session: SessionDep) -> dict:
    """re-fire decommission/req for a node that's already flagged in db.

    use when db says decommissioned but the mesh still has the node, eg the
    original publish dropped or the gateway was offline. no db write.
    """
    node = await session.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status != "decommissioned":
        # use the regular decommission endpoint for live nodes so db gets flipped
        raise HTTPException(
            status_code=409,
            detail="Node is not decommissioned; use the decommission endpoint",
        )
    request_id = str(uuid.uuid4())
    try:
        await publish_decommission_req(
            gateway_id=node.gateway_id,
            request_id=request_id,
            node_id=node.node_id,
            unicast_addr=node.mesh_unicast_addr,
            berth_id=node.berth_id,
        )
    except (MqttNotConnectedError, aiomqtt.MqttError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"decommission/req not delivered to gateway: {exc}",
        ) from exc
    return {"node_id": node_id, "request_id": request_id}

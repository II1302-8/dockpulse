"""node decommission, mqtt publish then db flip"""

import uuid

import aiomqtt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.dependencies import SessionDep
from app.models import Node
from app.mqtt import MqttNotConnected, publish_decommission_req

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
    except (MqttNotConnected, aiomqtt.MqttError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"decommission/req not delivered to gateway: {exc}",
        ) from exc
    node.status = "decommissioned"
    await session.commit()
    return {"node_id": node_id, "status": "decommissioned", "noop": False}

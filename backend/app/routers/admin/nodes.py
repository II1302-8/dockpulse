"""node decommission, db flip + mqtt publish"""

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.dependencies import SessionDep
from app.models import Node
from app.mqtt import publish_decommission_req

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

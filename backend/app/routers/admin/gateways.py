"""gateway crud + dock reassignment + dismiss-pending"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.dependencies import SessionDep
from app.models import Dock, Gateway, Node, PendingGateway

router = APIRouter()


class GatewayCreate(BaseModel):
    gateway_id: str = Field(min_length=1, max_length=64)
    dock_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)


class GatewayPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    provision_ttl_s: int | None = Field(default=None, ge=10, le=3600)
    dock_id: str | None = Field(
        default=None, min_length=1, max_length=64, description="Reassign to dock"
    )


class GatewayCreatedOut(BaseModel):
    gateway_id: str
    status: str = Field(examples=["offline"])


class GatewayPatchOut(BaseModel):
    gateway_id: str
    name: str
    dock_id: str
    provision_ttl_s: int | None = None


@router.post(
    "/gateways",
    response_model=GatewayCreatedOut,
    operation_id="adminCreateGateway",
    status_code=201,
)
async def create_gateway(body: GatewayCreate, session: SessionDep) -> dict:
    if await session.get(Dock, body.dock_id) is None:
        raise HTTPException(status_code=404, detail=f"Dock {body.dock_id} not found")
    if await session.get(Gateway, body.gateway_id) is not None:
        raise HTTPException(
            status_code=409, detail=f"Gateway {body.gateway_id} already exists"
        )
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
    pending = await session.get(PendingGateway, body.gateway_id)
    if pending is not None:
        await session.delete(pending)
    await session.commit()
    return {"gateway_id": gw.gateway_id, "status": gw.status}


@router.patch(
    "/gateways/{gateway_id}",
    response_model=GatewayPatchOut,
    operation_id="adminPatchGateway",
)
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
    if body.dock_id is not None and body.dock_id != gw.dock_id:
        if await session.get(Dock, body.dock_id) is None:
            raise HTTPException(
                status_code=404, detail=f"Dock {body.dock_id} not found"
            )
        clash = (
            await session.execute(
                select(Gateway).where(
                    Gateway.dock_id == body.dock_id,
                    Gateway.gateway_id != gw.gateway_id,
                )
            )
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Dock {body.dock_id} already has gateway {clash.gateway_id}",
            )
        gw.dock_id = body.dock_id
    await session.commit()
    return {
        "gateway_id": gw.gateway_id,
        "name": gw.name,
        "dock_id": gw.dock_id,
        "provision_ttl_s": gw.provision_ttl_s,
    }


@router.delete(
    "/gateways/{gateway_id}", operation_id="adminDeleteGateway", status_code=204
)
async def delete_gateway(gateway_id: str, session: SessionDep) -> None:
    gw = await session.get(Gateway, gateway_id)
    if gw is None:
        raise HTTPException(status_code=404, detail="Gateway not found")
    has_nodes = (
        await session.scalar(
            select(func.count()).select_from(Node).where(Node.gateway_id == gateway_id)
        )
    ) or 0
    if has_nodes:
        raise HTTPException(
            status_code=409,
            detail=f"Gateway has {has_nodes} node(s); decommission them first",
        )
    await session.delete(gw)
    await session.commit()


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

"""berth crud + force-reset"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.dependencies import SessionDep
from app.models import Berth, Dock, Node

router = APIRouter()


class BerthCreate(BaseModel):
    berth_id: str = Field(min_length=1, max_length=64)
    dock_id: str = Field(min_length=1, max_length=64)
    label: str | None = Field(default=None, max_length=64)
    length_m: float | None = Field(default=None, gt=0)
    width_m: float | None = Field(default=None, gt=0)
    depth_m: float | None = Field(default=None, gt=0)


class BerthPatch(BaseModel):
    label: str | None = Field(default=None, max_length=64)
    length_m: float | None = Field(default=None, gt=0)
    width_m: float | None = Field(default=None, gt=0)
    depth_m: float | None = Field(default=None, gt=0)
    is_reserved: bool | None = None


@router.get("/berths", operation_id="adminListBerths")
async def list_berths(session: SessionDep) -> list[dict]:
    rows = (
        (await session.execute(select(Berth).order_by(Berth.dock_id, Berth.berth_id)))
        .scalars()
        .all()
    )
    return [
        {
            "berth_id": b.berth_id,
            "dock_id": b.dock_id,
            "label": b.label,
            "length_m": b.length_m,
            "width_m": b.width_m,
            "depth_m": b.depth_m,
            "status": b.status,
            "is_reserved": b.is_reserved,
        }
        for b in rows
    ]


@router.post("/berths", operation_id="adminCreateBerth", status_code=201)
async def create_berth(body: BerthCreate, session: SessionDep) -> dict:
    if await session.get(Dock, body.dock_id) is None:
        raise HTTPException(status_code=404, detail=f"Dock {body.dock_id} not found")
    if await session.get(Berth, body.berth_id) is not None:
        raise HTTPException(
            status_code=409, detail=f"Berth {body.berth_id} already exists"
        )
    b = Berth(
        berth_id=body.berth_id,
        dock_id=body.dock_id,
        label=body.label,
        length_m=body.length_m,
        width_m=body.width_m,
        depth_m=body.depth_m,
        status="free",
    )
    session.add(b)
    await session.commit()
    return {"berth_id": b.berth_id, "dock_id": b.dock_id, "label": b.label}


@router.patch("/berths/{berth_id}", operation_id="adminPatchBerth")
async def patch_berth(berth_id: str, body: BerthPatch, session: SessionDep) -> dict:
    b = await session.get(Berth, berth_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    for field in ("label", "length_m", "width_m", "depth_m", "is_reserved"):
        v = getattr(body, field)
        if v is not None:
            setattr(b, field, v)
    await session.commit()
    return {
        "berth_id": b.berth_id,
        "label": b.label,
        "length_m": b.length_m,
        "width_m": b.width_m,
        "depth_m": b.depth_m,
        "is_reserved": b.is_reserved,
    }


@router.delete("/berths/{berth_id}", operation_id="adminDeleteBerth", status_code=204)
async def delete_berth(berth_id: str, session: SessionDep) -> None:
    b = await session.get(Berth, berth_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    has_node = (
        await session.scalar(
            select(func.count()).select_from(Node).where(Node.berth_id == berth_id)
        )
    ) or 0
    if has_node:
        raise HTTPException(
            status_code=409,
            detail=f"Berth has {has_node} node(s); decommission them first",
        )
    await session.delete(b)
    await session.commit()


@router.post("/berths/{berth_id}/reset", operation_id="adminResetBerth")
async def reset_berth(berth_id: str, session: SessionDep) -> dict:
    b = await session.get(Berth, berth_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    b.status = "free"
    b.sensor_raw = None
    await session.commit()
    return {"berth_id": b.berth_id, "status": b.status}

"""Dock CRUD."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.dependencies import SessionDep
from app.models import Berth, Dock, Gateway, Harbor

router = APIRouter()


class DockCreate(BaseModel):
    dock_id: str = Field(min_length=1, max_length=64)
    harbor_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)


class DockPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    harbor_id: str | None = Field(default=None, min_length=1, max_length=64)


@router.get("/docks", operation_id="adminListDocks")
async def list_docks(session: SessionDep) -> list[dict]:
    rows = (
        (await session.execute(select(Dock).order_by(Dock.harbor_id, Dock.dock_id)))
        .scalars()
        .all()
    )
    return [
        {"dock_id": d.dock_id, "harbor_id": d.harbor_id, "name": d.name} for d in rows
    ]


@router.post("/docks", operation_id="adminCreateDock", status_code=201)
async def create_dock(body: DockCreate, session: SessionDep) -> dict:
    if await session.get(Harbor, body.harbor_id) is None:
        raise HTTPException(
            status_code=404, detail=f"Harbor {body.harbor_id} not found"
        )
    if await session.get(Dock, body.dock_id) is not None:
        raise HTTPException(
            status_code=409, detail=f"Dock {body.dock_id} already exists"
        )
    d = Dock(dock_id=body.dock_id, harbor_id=body.harbor_id, name=body.name)
    session.add(d)
    await session.commit()
    return {"dock_id": d.dock_id, "harbor_id": d.harbor_id, "name": d.name}


@router.patch("/docks/{dock_id}", operation_id="adminPatchDock")
async def patch_dock(dock_id: str, body: DockPatch, session: SessionDep) -> dict:
    d = await session.get(Dock, dock_id)
    if d is None:
        raise HTTPException(status_code=404, detail="Dock not found")
    if body.name is not None:
        d.name = body.name
    if body.harbor_id is not None and body.harbor_id != d.harbor_id:
        if await session.get(Harbor, body.harbor_id) is None:
            raise HTTPException(
                status_code=404, detail=f"Harbor {body.harbor_id} not found"
            )
        d.harbor_id = body.harbor_id
    await session.commit()
    return {"dock_id": d.dock_id, "harbor_id": d.harbor_id, "name": d.name}


@router.delete("/docks/{dock_id}", operation_id="adminDeleteDock", status_code=204)
async def delete_dock(dock_id: str, session: SessionDep) -> None:
    d = await session.get(Dock, dock_id)
    if d is None:
        raise HTTPException(status_code=404, detail="Dock not found")
    has_berths = (
        await session.scalar(
            select(func.count()).select_from(Berth).where(Berth.dock_id == dock_id)
        )
    ) or 0
    has_gateway = (
        await session.scalar(
            select(func.count()).select_from(Gateway).where(Gateway.dock_id == dock_id)
        )
    ) or 0
    if has_berths or has_gateway:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Dock has {has_berths} berth(s) and "
                f"{has_gateway} gateway(s); remove them first"
            ),
        )
    await session.delete(d)
    await session.commit()

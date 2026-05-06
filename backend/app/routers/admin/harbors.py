"""Harbor CRUD."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.dependencies import SessionDep
from app.models import Dock, Harbor

router = APIRouter()


class HarborCreate(BaseModel):
    harbor_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    lat: float | None = None
    lng: float | None = None


class HarborPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    lat: float | None = None
    lng: float | None = None


@router.get("/harbors", operation_id="adminListHarbors")
async def list_harbors(session: SessionDep) -> list[dict]:
    rows = (
        (await session.execute(select(Harbor).order_by(Harbor.harbor_id)))
        .scalars()
        .all()
    )
    return [
        {"harbor_id": h.harbor_id, "name": h.name, "lat": h.lat, "lng": h.lng}
        for h in rows
    ]


@router.post("/harbors", operation_id="adminCreateHarbor", status_code=201)
async def create_harbor(body: HarborCreate, session: SessionDep) -> dict:
    if await session.get(Harbor, body.harbor_id) is not None:
        raise HTTPException(
            status_code=409, detail=f"Harbor {body.harbor_id} already exists"
        )
    h = Harbor(harbor_id=body.harbor_id, name=body.name, lat=body.lat, lng=body.lng)
    session.add(h)
    await session.commit()
    return {"harbor_id": h.harbor_id, "name": h.name, "lat": h.lat, "lng": h.lng}


@router.patch("/harbors/{harbor_id}", operation_id="adminPatchHarbor")
async def patch_harbor(harbor_id: str, body: HarborPatch, session: SessionDep) -> dict:
    h = await session.get(Harbor, harbor_id)
    if h is None:
        raise HTTPException(status_code=404, detail="Harbor not found")
    if body.name is not None:
        h.name = body.name
    if body.lat is not None:
        h.lat = body.lat
    if body.lng is not None:
        h.lng = body.lng
    await session.commit()
    return {"harbor_id": h.harbor_id, "name": h.name, "lat": h.lat, "lng": h.lng}


@router.delete(
    "/harbors/{harbor_id}", operation_id="adminDeleteHarbor", status_code=204
)
async def delete_harbor(harbor_id: str, session: SessionDep) -> None:
    h = await session.get(Harbor, harbor_id)
    if h is None:
        raise HTTPException(status_code=404, detail="Harbor not found")
    has_docks = (
        await session.scalar(
            select(func.count()).select_from(Dock).where(Dock.harbor_id == harbor_id)
        )
    ) or 0
    if has_docks:
        raise HTTPException(
            status_code=409,
            detail=f"Harbor has {has_docks} dock(s); delete them first",
        )
    await session.delete(h)
    await session.commit()

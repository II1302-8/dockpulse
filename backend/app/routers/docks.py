from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Dock
from app.schemas import DockOut, DockWithBerthsOut

router = APIRouter(prefix="/api/docks", tags=["docks"])

sessiondep = Annotated[AsyncSession, Depends(get_session)]


@router.get(
    "",
    response_model=list[DockOut],
    operation_id="listDocks",
    summary="List all docks",
)
async def list_docks(
    session: sessiondep,
    harbor_id: str | None = Query(None, description="Filter by harbor"),
) -> list[DockOut]:
    stmt = select(Dock)
    if harbor_id:
        stmt = stmt.where(Dock.harbor_id == harbor_id)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get(
    "/{dock_id}",
    response_model=DockWithBerthsOut,
    operation_id="getDock",
    summary="Get a single dock with its berths",
)
async def get_dock(dock_id: str, session: sessiondep) -> DockWithBerthsOut:
    dock = await session.get(Dock, dock_id)
    if not dock:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": f"Dock '{dock_id}' not found"},
        )
    return dock

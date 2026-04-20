from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Berth
from app.schemas import BerthOut

router = APIRouter(prefix="/api/berths", tags=["berths"])
sessiondep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/{berth_id}", response_model=BerthOut, operation_id="getBerth")
async def get_berth(berth_id: str, session: sessiondep):
    berth = await session.get(Berth, berth_id)
    if not berth:
        raise HTTPException(status_code=404, detail="Berth not found")
    return berth


@router.get("", response_model=list[BerthOut], operation_id="getBerth")
async def list_berths(
    session: sessiondep,
    dock_id: str | None = Query(None, description="filter by dock"),
    status: str | None = Query(
        None, pattern="^(free|occupied)$", description="filter by status"
    ),
):
    stmt = select(Berth)
    if dock_id:
        stmt = stmt.where(Berth.dock_id == dock_id)
    if status:
        stmt = stmt.where(Berth.status == status)
    result = await session.execute(stmt)
    return result.scalars().all()

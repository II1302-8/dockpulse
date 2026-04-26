import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app import broadcaster
from app.db import get_session
from app.models import Berth
from app.schemas import BerthOut

router = APIRouter(prefix="/api/berths", tags=["berths"])
sessiondep = Annotated[AsyncSession, Depends(get_session)]

SSE_PING_SECONDS = 15


@router.get("/stream", operation_id="streamBerths")
async def stream_berths(request: Request):
    async def event_gen():
        async with broadcaster.subscribe() as queue:
            while True:
                if await request.is_disconnected():
                    return
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                except TimeoutError:
                    continue
                yield {"event": event["type"], "data": json.dumps(event)}

    return EventSourceResponse(event_gen(), ping=SSE_PING_SECONDS)


@router.get("/{berth_id}", response_model=BerthOut, operation_id="getBerth")
async def get_berth(berth_id: str, session: sessiondep):
    berth = await session.get(Berth, berth_id)
    if not berth:
        raise HTTPException(status_code=404, detail="Berth not found")
    return berth


@router.get("", response_model=list[BerthOut], operation_id="listBerths")
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

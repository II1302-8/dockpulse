import asyncio
import json

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from app import broadcaster
from app.dependencies import HarbormasterDep, SessionDep
from app.models import Assignment, Berth
from app.schemas import BerthOut, BerthUpdateEvent

router = APIRouter(prefix="/api/berths", tags=["berths"])

SSE_PING_SECONDS = 15


@router.get(
    "",
    response_model=list[BerthOut],
    operation_id="listBerths",
    summary="List all berths",
)
async def list_berths(
    session: SessionDep,
    dock_id: str | None = Query(None, description="filter by dock"),
    status: str | None = Query(
        None, pattern="^(free|occupied)$", description="filter by status"
    ),
):
    # Added selectinload here too so the dashboard list shows assignments
    stmt = select(Berth).options(selectinload(Berth.assignment))

    if dock_id:
        stmt = stmt.where(Berth.dock_id == dock_id)
    if status:
        stmt = stmt.where(Berth.status == status)

    result = await session.execute(stmt)
    return result.scalars().all()


@router.get(
    "/stream",
    operation_id="streamBerths",
    summary="Subscribe to live berth updates via Server-Sent Events",
    description=(
        "Opens a long-lived `text/event-stream` connection. Each message is a "
        "JSON-encoded `BerthUpdateEvent`. Clients should first fetch a snapshot "
        "via `GET /api/berths` and then merge streamed updates by `berth_id`. "
        "Reconnects re-subscribe but do not replay missed events — re-fetch the "
        "snapshot after an `open` that follows a disconnection."
    ),
    response_class=EventSourceResponse,
    responses={
        200: {
            "model": BerthUpdateEvent,
            "description": "Each frame is a JSON-encoded BerthUpdateEvent.",
        }
    },
)
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


@router.get(
    "/{berth_id}",
    response_model=BerthOut,
    operation_id="getBerth",
    summary="Get a single berth",
)
async def get_berth(berth_id: str, session: SessionDep):
    # Added selectinload to ensure the assignment is visible in the response
    stmt = (
        select(Berth)
        .options(selectinload(Berth.assignment))
        .where(Berth.berth_id == berth_id)
    )
    result = await session.execute(stmt)
    berth = result.scalar_one_or_none()

    if not berth:
        raise HTTPException(status_code=404, detail="Berth not found")
    return berth


@router.post(
    "/{berth_id}/assignment",
    response_model=BerthOut,
    operation_id="assignBerth",
    summary="Assign a berth to a user",
)
async def assign_berth(
    berth_id: str, user_id: str, session: SessionDep, _: HarbormasterDep
):
    berth = await session.get(Berth, berth_id)
    if not berth:
        raise HTTPException(status_code=404, detail="Berth not found")

    new_assignment = Assignment(berth_id=berth_id, user_id=user_id)
    await session.merge(new_assignment)

    berth.status = "occupied"
    berth.is_reserved = True
    session.add(berth)
    await session.commit()

    stmt = (
        select(Berth)
        .options(selectinload(Berth.assignment))
        .where(Berth.berth_id == berth_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one()


@router.get(
    "/{berth_id}/assignment",
    response_model=BerthOut,
    operation_id="getBerthAssignment",
    summary="Get a berth assignment",
)
async def get_berth_assignment(berth_id: str, session: SessionDep):
    # Updated to use selectinload; otherwise, assignment will be empty
    stmt = (
        select(Berth)
        .options(selectinload(Berth.assignment))
        .where(Berth.berth_id == berth_id)
    )
    result = await session.execute(stmt)
    berth = result.scalar_one_or_none()

    if not berth:
        raise HTTPException(status_code=404, detail="Berth not found")
    return berth


@router.delete(
    "/{berth_id}/assignment",
    response_model=BerthOut,
    operation_id="removeBerthAssignment",
    summary="Remove a berth assignment",
)
async def remove_berth_assignment(
    berth_id: str, session: SessionDep, _: HarbormasterDep
):
    from sqlalchemy import delete

    berth = await session.get(Berth, berth_id)
    if not berth:
        raise HTTPException(status_code=404, detail="Berth not found")

    await session.execute(delete(Assignment).where(Assignment.berth_id == berth_id))
    berth.status = "free"
    berth.is_reserved = False
    session.add(berth)
    await session.commit()

    await session.refresh(berth)
    return berth

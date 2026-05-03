import asyncio
import json

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from app import broadcaster
from app.dependencies import HarbormasterDep, SessionDep
from app.models import Assignment, Berth, Event, User
from app.schemas import AssignBerthIn, BerthOut, BerthUpdateEvent, EventOut

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


async def _load_berth_with_assignment(session, berth_id: str) -> Berth | None:
    stmt = (
        select(Berth)
        .options(selectinload(Berth.assignment))
        .where(Berth.berth_id == berth_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


@router.get(
    "/{berth_id}",
    response_model=BerthOut,
    operation_id="getBerth",
    summary="Get a single berth",
)
async def get_berth(berth_id: str, session: SessionDep):
    berth = await _load_berth_with_assignment(session, berth_id)
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
    berth_id: str,
    body: AssignBerthIn,
    session: SessionDep,
    _: HarbormasterDep,
):
    berth = await session.get(Berth, berth_id)
    if not berth:
        raise HTTPException(status_code=404, detail="Berth not found")
    if not await session.get(User, body.user_id):
        raise HTTPException(status_code=404, detail="User not found")

    # merge by single-PK berth_id reuses the row, replacing user on re-assign
    await session.merge(Assignment(berth_id=berth_id, user_id=body.user_id))
    berth.status = "occupied"
    berth.is_reserved = True
    await session.commit()

    return await _load_berth_with_assignment(session, berth_id)


@router.get(
    "/{berth_id}/events",
    response_model=list[EventOut],
    operation_id="listBerthEvents",
    summary="List events for a berth",
)
async def list_berth_events(
    berth_id: str,
    session: SessionDep,
    _: HarbormasterDep,
    limit: int = Query(100, ge=1, le=1000),
):
    berth = await session.get(Berth, berth_id)
    if not berth:
        raise HTTPException(status_code=404, detail="Berth not found")
    result = await session.execute(
        select(Event)
        .where(Event.berth_id == berth_id)
        .order_by(Event.timestamp.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.delete(
    "/{berth_id}/assignment",
    response_model=BerthOut,
    operation_id="removeBerthAssignment",
    summary="Remove a berth assignment",
)
async def remove_berth_assignment(
    berth_id: str, session: SessionDep, _: HarbormasterDep
):
    berth = await session.get(Berth, berth_id)
    if not berth:
        raise HTTPException(status_code=404, detail="Berth not found")

    await session.execute(delete(Assignment).where(Assignment.berth_id == berth_id))
    berth.status = "free"
    berth.is_reserved = False
    await session.commit()

    return await _load_berth_with_assignment(session, berth_id)

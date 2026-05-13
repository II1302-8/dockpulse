"""cross-harbor event listing for the admin panel"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.dependencies import SessionDep
from app.models import Berth, Dock, Event

router = APIRouter()


class AdminEventOut(BaseModel):
    event_id: str
    berth_id: str
    harbor_id: str
    node_id: str | None
    event_type: str
    timestamp: datetime
    actor_user_id: str | None = None
    subject_user_id: str | None = None


class AdminEventList(BaseModel):
    items: list[AdminEventOut]
    total: int


@router.get(
    "/events",
    response_model=AdminEventList,
    operation_id="adminListEvents",
)
async def list_events(
    session: SessionDep,
    harbor_id: Annotated[str | None, Query()] = None,
    event_type: Annotated[list[str] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    base = (
        select(Event, Dock.harbor_id)
        .join(Berth, Berth.berth_id == Event.berth_id)
        .join(Dock, Dock.dock_id == Berth.dock_id)
    )
    if harbor_id:
        base = base.where(Dock.harbor_id == harbor_id)
    if event_type:
        base = base.where(Event.event_type.in_(event_type))

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    page_stmt = base.order_by(Event.timestamp.desc()).limit(limit).offset(offset)
    rows = (await session.execute(page_stmt)).all()
    return {
        "total": total,
        "items": [
            {
                "event_id": e.event_id,
                "berth_id": e.berth_id,
                "harbor_id": h_id,
                "node_id": e.node_id,
                "event_type": e.event_type,
                "timestamp": e.timestamp,
                "actor_user_id": e.actor_user_id,
                "subject_user_id": e.subject_user_id,
            }
            for e, h_id in rows
        ],
    }

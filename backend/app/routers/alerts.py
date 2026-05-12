from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, update

from app.dependencies import (
    AnyHarbormasterDep,
    SessionDep,
    user_managed_harbor_ids,
)
from app.models import Alert, Berth, Dock
from app.schemas import AlertOut

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get(
    "",
    response_model=list[AlertOut],
    operation_id="listAlerts",
    summary="List alerts in harbors the user manages",
)
async def list_alerts(
    user: AnyHarbormasterDep,
    session: SessionDep,
    acknowledged: Annotated[
        bool | None,
        Query(
            description=(
                "filter by acknowledged flag; omit to return both states"
            ),
        ),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    managed = await user_managed_harbor_ids(user, session)
    if not managed:
        return []
    stmt = (
        select(Alert)
        .join(Berth, Berth.berth_id == Alert.berth_id)
        .join(Dock, Dock.dock_id == Berth.dock_id)
        .where(Dock.harbor_id.in_(managed))
        .order_by(Alert.timestamp.desc())
        .limit(limit)
    )
    if acknowledged is not None:
        stmt = stmt.where(Alert.acknowledged == acknowledged)
    rows = (await session.execute(stmt)).scalars().all()
    return rows


@router.post(
    "/{alert_id}/acknowledge",
    response_model=AlertOut,
    operation_id="acknowledgeAlert",
    summary="Mark an alert as acknowledged",
)
async def acknowledge_alert(
    alert_id: str,
    user: AnyHarbormasterDep,
    session: SessionDep,
):
    # ensure the alert lives in a harbor this user manages before flipping
    managed = await user_managed_harbor_ids(user, session)
    if not managed:
        raise HTTPException(status_code=404, detail="Alert not found")

    row = (
        await session.execute(
            select(Alert)
            .join(Berth, Berth.berth_id == Alert.berth_id)
            .join(Dock, Dock.dock_id == Berth.dock_id)
            .where(Alert.alert_id == alert_id, Dock.harbor_id.in_(managed))
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    # idempotent: re-acknowledging a row just returns the existing state
    if not row.acknowledged:
        await session.execute(
            update(Alert)
            .where(Alert.alert_id == alert_id)
            .values(acknowledged=True, updated_at=datetime.now(UTC))
        )
        await session.commit()
        await session.refresh(row)
    return row

"""cross-harbor alert listing + acknowledge for the admin panel"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, update

from app.dependencies import SessionDep
from app.models import Alert

router = APIRouter()


class AdminAlertOut(BaseModel):
    alert_id: str
    berth_id: str
    type: str
    message: str
    acknowledged: bool
    timestamp: datetime


@router.get(
    "/alerts",
    response_model=list[AdminAlertOut],
    operation_id="adminListAlerts",
)
async def list_alerts(
    session: SessionDep,
    acknowledged: Annotated[bool | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[dict]:
    stmt = select(Alert).order_by(Alert.timestamp.desc()).limit(limit)
    if acknowledged is not None:
        stmt = stmt.where(Alert.acknowledged == acknowledged)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "alert_id": a.alert_id,
            "berth_id": a.berth_id,
            "type": a.type,
            "message": a.message,
            "acknowledged": a.acknowledged,
            "timestamp": a.timestamp,
        }
        for a in rows
    ]


@router.post(
    "/alerts/{alert_id}/acknowledge",
    response_model=AdminAlertOut,
    operation_id="adminAcknowledgeAlert",
)
async def acknowledge_alert(alert_id: str, session: SessionDep) -> dict:
    a = await session.get(Alert, alert_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if not a.acknowledged:
        await session.execute(
            update(Alert)
            .where(Alert.alert_id == alert_id)
            .values(acknowledged=True, updated_at=datetime.now(UTC))
        )
        await session.commit()
        await session.refresh(a)
    return {
        "alert_id": a.alert_id,
        "berth_id": a.berth_id,
        "type": a.type,
        "message": a.message,
        "acknowledged": a.acknowledged,
        "timestamp": a.timestamp,
    }


@router.delete(
    "/alerts/{alert_id}",
    operation_id="adminDeleteAlert",
    status_code=204,
)
async def delete_alert(alert_id: str, session: SessionDep) -> None:
    a = await session.get(Alert, alert_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    await session.delete(a)
    await session.commit()

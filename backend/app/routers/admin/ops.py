"""live ops health: broker + SSE + backlog counters for the admin dashboard"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app import broadcaster
from app.dependencies import SessionDep
from app.models import AdoptionRequest as Adoption
from app.models import Alert, Berth, PendingGateway
from app.mqtt import is_mqtt_connected

router = APIRouter()

# stale-berth threshold matches the 5-min heartbeat * 3 disconnect window
_STALE_BERTH_MINUTES = 15
_ALERT_WINDOW_HOURS = 24


class OpsHealth(BaseModel):
    mqtt_connected: bool
    sse_subscribers: int
    pending_adoptions: int
    pending_gateways: int
    alerts_last_24h: int
    stale_berths: int
    checked_at: datetime


@router.get(
    "/ops",
    response_model=OpsHealth,
    operation_id="adminOpsHealth",
    summary="Live broker/SSE/backlog counters for the ops dashboard",
)
async def ops_health(session: SessionDep) -> dict:
    now = datetime.now(UTC)
    stale_cutoff = now - timedelta(minutes=_STALE_BERTH_MINUTES)
    alert_cutoff = now - timedelta(hours=_ALERT_WINDOW_HOURS)

    pending_adoptions = (
        await session.scalar(
            select(func.count())
            .select_from(Adoption)
            .where(Adoption.status == "pending")
        )
    ) or 0
    pending_gateways = (
        await session.scalar(select(func.count()).select_from(PendingGateway))
    ) or 0
    alerts_last_24h = (
        await session.scalar(
            select(func.count())
            .select_from(Alert)
            .where(Alert.created_at >= alert_cutoff)
        )
    ) or 0
    # berth.last_updated is NULL until first reading lands. count those as
    # stale too since they're functionally indistinguishable from offline
    stale_berths = (
        await session.scalar(
            select(func.count())
            .select_from(Berth)
            .where((Berth.last_updated.is_(None)) | (Berth.last_updated < stale_cutoff))
        )
    ) or 0

    return {
        "mqtt_connected": is_mqtt_connected(),
        "sse_subscribers": broadcaster.subscriber_count(),
        "pending_adoptions": pending_adoptions,
        "pending_gateways": pending_gateways,
        "alerts_last_24h": alerts_last_24h,
        "stale_berths": stale_berths,
        "checked_at": now,
    }

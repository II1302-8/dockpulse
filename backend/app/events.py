import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import broadcaster
from app.models import Berth, Event
from app.schemas import BerthUpdateEvent


def _publish_berth_update(berth: Berth) -> None:
    event = BerthUpdateEvent(berth=berth)
    broadcaster.publish(event.model_dump(mode="json"))


async def _load_berth(session: AsyncSession, berth_id: str) -> Berth | None:
    # eager-load assignment so BerthOut serialization never lazy-loads in async
    stmt = (
        select(Berth)
        .options(selectinload(Berth.assignment))
        .where(Berth.berth_id == berth_id)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def process_sensor_reading(
    session: AsyncSession,
    *,
    berth_id: str,
    node_id: str,
    occupied: bool,
    sensor_raw: int,
    battery_pct: int | None = None,
) -> Event | None:
    """Persist a berth status reading. Return a new Event on state change."""
    berth = await _load_berth(session, berth_id)
    if berth is None:
        raise ValueError(f"Unknown berth: {berth_id}")

    prev_status = berth.status
    prev_battery = berth.battery_pct

    now = datetime.now(UTC)
    new_status = "occupied" if occupied else "free"

    berth.sensor_raw = sensor_raw
    berth.last_updated = now
    if battery_pct is not None:
        berth.battery_pct = battery_pct

    if new_status == prev_status or berth.is_reserved:
        await session.commit()
        if berth.battery_pct != prev_battery:
            _publish_berth_update(berth)
        return None

    event = Event(
        event_id=str(uuid.uuid4()),
        berth_id=berth_id,
        node_id=node_id,
        event_type="occupied" if occupied else "freed",
        sensor_raw=sensor_raw,
        timestamp=now,
    )
    berth.status = new_status
    session.add(event)
    await session.commit()
    _publish_berth_update(berth)
    return event


async def process_heartbeat(
    session: AsyncSession,
    *,
    berth_id: str,
    battery_pct: int | None = None,
) -> None:
    """Touch berth liveness from a heartbeat; no Event row written."""
    berth = await _load_berth(session, berth_id)
    if berth is None:
        raise ValueError(f"Unknown berth: {berth_id}")
    berth.last_updated = datetime.now(UTC)
    if battery_pct is not None:
        berth.battery_pct = battery_pct
    await session.commit()
    _publish_berth_update(berth)

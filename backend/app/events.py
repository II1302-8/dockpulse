import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app import broadcaster
from app.models import Berth, Event
from app.schemas import BerthUpdateEvent


def _publish_berth_update(berth: Berth) -> None:
    event = BerthUpdateEvent(berth=berth)
    broadcaster.publish(event.model_dump(mode="json"))


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
    berth = await session.get(Berth, berth_id)
    if berth is None:
        raise ValueError(f"Unknown berth: {berth_id}")

    now = datetime.now(UTC)
    new_status = "occupied" if occupied else "free"

    berth.sensor_raw = sensor_raw
    berth.last_updated = now
    if battery_pct is not None:
        berth.battery_pct = battery_pct

    if new_status == berth.status:
        await session.commit()
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
    berth = await session.get(Berth, berth_id)
    if berth is None:
        raise ValueError(f"Unknown berth: {berth_id}")
    berth.last_updated = datetime.now(UTC)
    if battery_pct is not None:
        berth.battery_pct = battery_pct
    await session.commit()
    _publish_berth_update(berth)

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Berth, Event


async def process_sensor_reading(
    session: AsyncSession,
    *,
    berth_id: str,
    node_id: str,
    status: str,
    sensor_raw: int,
) -> Event | None:
    """Process a sensor reading and create an event if the berth state changed.

    Returns the new Event on state change, or None if status is unchanged.
    """
    if status not in ("free", "occupied"):
        raise ValueError(f"Invalid status: {status}")

    berth = await session.get(Berth, berth_id)
    if berth is None:
        raise ValueError(f"Unknown berth: {berth_id}")

    now = datetime.now(UTC)

    # Always update sensor telemetry on the berth
    berth.sensor_raw = sensor_raw
    berth.last_updated = now

    # Only log an event when the status actually changes
    if status == berth.status:
        await session.commit()
        return None

    event_type = "occupied" if status == "occupied" else "freed"
    event = Event(
        event_id=str(uuid.uuid4()),
        berth_id=berth_id,
        node_id=node_id,
        event_type=event_type,
        sensor_raw=sensor_raw,
        timestamp=now,
    )

    berth.status = status
    session.add(event)
    await session.commit()
    return event

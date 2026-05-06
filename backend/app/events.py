import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app import broadcaster
from app.models import Berth, Event, Node, User
from app.notifications import send_email
from app.schemas import BerthUpdateEvent

logger = logging.getLogger(__name__)

# todo harbor-scope once User has harbor_id pages every hm right now


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


async def _notify_harbormasters(
    session: AsyncSession,
    berth: Berth,
    new_status: str,
    event_id: str,
) -> None:
    result = await session.execute(
        select(User)
        .where(User.role == "harbormaster")
        .options(joinedload(User.notification_prefs))
    )
    harbormasters = result.unique().scalars().all()

    label = berth.label or berth.berth_id
    if new_status == "occupied":
        subject = f"Berth {label} is now occupied"
        html = f"<p>Berth <strong>{label}</strong> has been occupied.</p>"
    else:
        subject = f"Berth {label} is now free"
        html = f"<p>Berth <strong>{label}</strong> has been freed.</p>"

    coros = []
    for hm in harbormasters:
        prefs = hm.notification_prefs
        if prefs is not None:
            if new_status == "occupied" and not prefs.notify_arrival:
                continue
            if new_status == "free" and not prefs.notify_departure:
                continue

        idem_key = f"berth-status/{event_id}/{hm.user_id}"
        coros.append(send_email(hm.email, subject, html, idem_key))

    results = await asyncio.gather(*coros, return_exceptions=True)
    for exc in results:
        if isinstance(exc, BaseException):
            logger.warning("Failed to send notification email: %s", exc)


async def process_sensor_reading(
    session: AsyncSession,
    *,
    berth_id: str,
    node_id: str,
    mesh_unicast_addr: str,
    occupied: bool,
    sensor_raw: int,
    battery_pct: int | None = None,
) -> Event | None:
    """Persist a berth status reading. Return a new Event on state change."""
    berth = await _load_berth(session, berth_id)
    if berth is None:
        raise ValueError(f"Unknown berth: {berth_id}")

    # reject rogue nodes publishing to a berth they aren't bound to
    registered = await session.execute(
        select(Node).where(Node.berth_id == berth_id, Node.status != "decommissioned")
    )
    node = registered.scalar_one_or_none()
    if node is not None and node.mesh_unicast_addr != mesh_unicast_addr:
        raise ValueError(
            f"unicast addr mismatch for berth {berth_id}: "
            f"registered={node.mesh_unicast_addr} got={mesh_unicast_addr}"
        )

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
        mesh_unicast_addr=mesh_unicast_addr,
        timestamp=now,
    )
    berth.status = new_status
    session.add(event)
    await session.commit()
    _publish_berth_update(berth)
    await _notify_harbormasters(session, berth, new_status, event.event_id)
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

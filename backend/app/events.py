import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app import broadcaster
from app.email_templates import render as render_email
from app.models import (
    Berth,
    BerthAvailabilityWindow,
    Dock,
    Event,
    Node,
    User,
    UserHarborRole,
)
from app.notifications import send_email
from app.schemas import BerthUpdateEvent
from app.serializers import berths_with_active_windows, serialize_berth

logger = logging.getLogger(__name__)


async def publish_berth_update(session: AsyncSession, berth: Berth) -> None:
    active = await berths_with_active_windows(session, [berth.berth_id])
    out = serialize_berth(berth, has_active_window=berth.berth_id in active)
    event = BerthUpdateEvent(berth=out)
    broadcaster.publish(event.model_dump(mode="json"))


async def load_berth_with_assignment(
    session: AsyncSession, berth_id: str
) -> Berth | None:
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
    # only harbormasters of the harbor that owns this berth
    result = await session.execute(
        select(User)
        .join(UserHarborRole, UserHarborRole.user_id == User.user_id)
        .join(Dock, Dock.harbor_id == UserHarborRole.harbor_id)
        .where(
            Dock.dock_id == berth.dock_id,
            UserHarborRole.role == "harbormaster",
        )
        .options(joinedload(User.notification_prefs))
    )
    harbormasters = result.unique().scalars().all()
    label = berth.label or berth.berth_id

    if new_status == "occupied":
        # sensor has no boat identity so a window-less occupied could be
        # owner or stranger. flagging both is the closest we can get; once
        # berth invites land we can tighten this to "visitor without invite"
        now = datetime.now(UTC)
        window_result = await session.execute(
            select(BerthAvailabilityWindow).where(
                BerthAvailabilityWindow.berth_id == berth.berth_id,
                BerthAvailabilityWindow.from_date < now,
                BerthAvailabilityWindow.return_date > now,
            )
        )
        if window_result.scalars().first() is not None:
            return
        subject = f"Berth {label} is now occupied"
        html = render_email(
            title="Unauthorized mooring detected",
            preheader=(
                f"Berth {label} just flipped to occupied with no active window."
            ),
            intro=f"Berth {label} is now occupied.",
            body_paragraphs=[
                "The sensor reports a boat at this berth but no availability "
                "window is currently active. Verify the mooring is authorized.",
            ],
        )
        pref_attr = "notify_arrival"
    elif new_status == "free":
        subject = f"Berth {label} is now free"
        html = render_email(
            title="Berth departure",
            preheader=f"Berth {label} just flipped to free.",
            intro=f"Berth {label} is now free.",
            body_paragraphs=[
                "The sensor reports the slot has been vacated.",
            ],
        )
        pref_attr = "notify_departure"
    else:
        return

    coros = []
    for hm in harbormasters:
        prefs = hm.notification_prefs
        if prefs is not None and not getattr(prefs, pref_attr):
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
    expected_gateway_id: str | None = None,
) -> Event | None:
    """Persist a berth status reading. Return a new Event on state change.

    If ``expected_gateway_id`` is provided (caller validated the MQTT topic
    against the publishing cert), the registered Node must belong to that
    gateway — guards against a single compromised gateway forging status for
    berths it doesn't serve.
    """
    berth = await load_berth_with_assignment(session, berth_id)
    if berth is None:
        raise ValueError(f"Unknown berth: {berth_id}")

    # reject rogue nodes publishing to a berth they aren't bound to
    registered = await session.execute(
        select(Node).where(Node.berth_id == berth_id, Node.status != "decommissioned")
    )
    node = registered.scalar_one_or_none()
    if node is not None:
        if node.mesh_unicast_addr != mesh_unicast_addr:
            raise ValueError(
                f"unicast addr mismatch for berth {berth_id}: "
                f"registered={node.mesh_unicast_addr} got={mesh_unicast_addr}"
            )
        if expected_gateway_id is not None and node.gateway_id != expected_gateway_id:
            raise ValueError(
                f"gateway mismatch for berth {berth_id}: "
                f"node.gateway={node.gateway_id} topic.gateway={expected_gateway_id}"
            )
        if node.node_id != node_id:
            raise ValueError(
                f"node_id mismatch for berth {berth_id}: "
                f"registered={node.node_id} got={node_id}"
            )

    prev_status = berth.status
    prev_battery = berth.battery_pct

    now = datetime.now(UTC)
    new_status = "occupied" if occupied else "free"

    berth.sensor_raw = sensor_raw
    berth.last_updated = now
    if battery_pct is not None:
        berth.battery_pct = battery_pct

    if new_status == prev_status:
        await session.commit()
        if berth.battery_pct != prev_battery:
            await publish_berth_update(session, berth)
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
    # status mirrors the sensor regardless of reservation so the activity
    # log + serializer see ground truth. is_reserved separately drives
    # is_available_now in the BerthOut serializer
    berth.status = new_status
    session.add(event)
    await session.commit()
    await publish_berth_update(session, berth)
    # skip notification noise for owner arrivals/departures on reserved
    # berths, harbormaster only cares about unauthorized activity. also skip
    # un-adopted berths so a rogue device-cert can't spam emails by posting
    # status for a berth_id no node has claimed
    if not berth.is_reserved and node is not None:
        await _notify_harbormasters(session, berth, new_status, event.event_id)
    return event


async def process_heartbeat(
    session: AsyncSession,
    *,
    berth_id: str,
    battery_pct: int | None = None,
) -> None:
    """Touch berth liveness from a heartbeat; no Event row written."""
    berth = await load_berth_with_assignment(session, berth_id)
    if berth is None:
        raise ValueError(f"Unknown berth: {berth_id}")
    berth.last_updated = datetime.now(UTC)
    if battery_pct is not None:
        berth.battery_pct = battery_pct
    await session.commit()
    await publish_berth_update(session, berth)

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
    Alert,
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


async def _handle_unauthorized_occupation(
    session: AsyncSession, berth: Berth, label: str, now: datetime
) -> tuple[str, str] | None:
    """Window check + dedup alert. Returns (subject, html) or None if authorized."""
    # sensor has no boat identity so a window-less occupied could be owner or
    # stranger; once berth invites land we can tighten to "visitor without invite"
    window = (
        (
            await session.execute(
                select(BerthAvailabilityWindow).where(
                    BerthAvailabilityWindow.berth_id == berth.berth_id,
                    BerthAvailabilityWindow.from_date < now,
                    BerthAvailabilityWindow.return_date > now,
                )
            )
        )
        .scalars()
        .first()
    )
    if window is not None:
        return None

    # dedup: skip if an unacknowledged alert already exists so a stuck sensor
    # doesn't spam the alerts table
    existing = (
        await session.execute(
            select(Alert).where(
                Alert.berth_id == berth.berth_id,
                Alert.type == "unauthorized_mooring",
                Alert.acknowledged.is_(False),
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        session.add(
            Alert(
                alert_id=str(uuid.uuid4()),
                berth_id=berth.berth_id,
                type="unauthorized_mooring",
                message=(
                    f"Berth {label} is occupied with no active availability "
                    "window. Verify the mooring is authorized."
                ),
                acknowledged=False,
                timestamp=now,
            )
        )
        await session.commit()

    subject = f"Berth {label} is now occupied"
    html = render_email(
        title="Unauthorized mooring detected",
        preheader=f"Berth {label} just flipped to occupied with no active window.",
        intro=f"Berth {label} is now occupied.",
        body_paragraphs=[
            "The sensor reports a boat at this berth but no availability "
            "window is currently active. Verify the mooring is authorized.",
        ],
    )
    return subject, html


def _build_departure_email(label: str) -> tuple[str, str]:
    subject = f"Berth {label} is now free"
    html = render_email(
        title="Berth departure",
        preheader=f"Berth {label} just flipped to free.",
        intro=f"Berth {label} is now free.",
        body_paragraphs=["The sensor reports the slot has been vacated."],
    )
    return subject, html


async def _notify_harbormasters(
    session: AsyncSession,
    berth: Berth,
    new_status: str,
    event_id: str,
) -> None:
    label = berth.label or berth.berth_id

    if new_status == "occupied":
        result = await _handle_unauthorized_occupation(
            session, berth, label, datetime.now(UTC)
        )
        if result is None:
            return
        subject, html = result
        pref_attr = "notify_arrival"
    elif new_status == "free":
        subject, html = _build_departure_email(label)
        pref_attr = "notify_departure"
    else:
        return

    hm_result = await session.execute(
        select(User)
        .join(UserHarborRole, UserHarborRole.user_id == User.user_id)
        .join(Dock, Dock.harbor_id == UserHarborRole.harbor_id)
        .where(Dock.dock_id == berth.dock_id, UserHarborRole.role == "harbormaster")
        .options(joinedload(User.notification_prefs))
    )
    harbormasters = hm_result.unique().scalars().all()

    coros = [
        send_email(hm.email, subject, html, f"berth-status/{event_id}/{hm.user_id}")
        for hm in harbormasters
        if hm.notification_prefs is None or getattr(hm.notification_prefs, pref_attr)
    ]
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

    # reject rogue nodes publishing to a berth they aren't bound to.
    # payload node_id is informational, gateway has no path to learn the
    # backend-minted uuid; identity is pinned by unicast addr + gateway cn
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

    # prefer DB-canonical node_id over payload (firmware sends a sentinel
    # like "node-001" since it never learns its adoption-time uuid)
    event_node_id = node.node_id if node is not None else node_id
    event = Event(
        event_id=str(uuid.uuid4()),
        berth_id=berth_id,
        node_id=event_node_id,
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

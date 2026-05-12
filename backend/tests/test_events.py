from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.events import process_heartbeat, process_sensor_reading
from app.models import Berth, BerthAvailabilityWindow, Event, Gateway, Node


async def test_state_change_creates_event(session, seeded_berth):
    event = await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
        battery_pct=80,
    )
    assert event is not None
    assert event.event_type == "occupied"
    assert event.node_id == "n1"
    assert event.sensor_raw == 500

    berth = await session.get(Berth, "b1")
    assert berth.status == "occupied"
    assert berth.sensor_raw == 500
    assert berth.battery_pct == 80
    assert berth.last_updated is not None


async def test_same_status_returns_none_but_updates_telemetry(session, seeded_berth):
    event = await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=False,
        sensor_raw=100,
        battery_pct=55,
    )
    assert event is None

    berth = await session.get(Berth, "b1")
    assert berth.status == "free"
    assert berth.sensor_raw == 100
    assert berth.battery_pct == 55
    assert berth.last_updated is not None

    events = (await session.execute(select(Event))).scalars().all()
    assert events == []


async def test_toggle_creates_two_events(session, seeded_berth):
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=False,
        sensor_raw=100,
    )
    events = (
        (await session.execute(select(Event).order_by(Event.timestamp))).scalars().all()
    )
    assert [e.event_type for e in events] == ["occupied", "freed"]


async def test_unknown_berth_raises(session):
    with pytest.raises(ValueError, match="Unknown berth"):
        await process_sensor_reading(
            session,
            berth_id="does-not-exist",
            node_id="n1",
            mesh_unicast_addr="0x0042",
            occupied=True,
            sensor_raw=0,
        )


async def test_battery_pct_optional(session, seeded_berth):
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    berth = await session.get(Berth, "b1")
    assert berth.battery_pct is None


async def test_heartbeat_touches_berth_without_event(session, seeded_berth):
    await process_heartbeat(session, berth_id="b1", battery_pct=42)

    berth = await session.get(Berth, "b1")
    assert berth.battery_pct == 42
    assert berth.last_updated is not None

    events = (await session.execute(select(Event))).scalars().all()
    assert events == []


async def test_heartbeat_unknown_berth_raises(session):
    with pytest.raises(ValueError, match="Unknown berth"):
        await process_heartbeat(session, berth_id="does-not-exist")


async def _seed_node(session, berth_id="b1", unicast="0x0042") -> Node:
    session.add(Gateway(gateway_id="gw1", dock_id="d1", name="GW", status="online"))
    node = Node(
        node_id="node-uuid-1",
        mesh_uuid="meshuuid1",
        serial_number="DP-N-1",
        berth_id=berth_id,
        gateway_id="gw1",
        mesh_unicast_addr=unicast,
        dev_key_fp="fp",
        status="provisioned",
        adopted_at=datetime.now(UTC),
    )
    session.add(node)
    await session.commit()
    return node


async def test_unicast_addr_matches_registered_node(session, seeded_berth):
    await _seed_node(session, unicast="0x0042")
    event = await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    assert event is not None
    assert event.event_type == "occupied"
    assert event.mesh_unicast_addr == "0x0042"


async def test_unicast_addr_mismatch_raises(session, seeded_berth):
    await _seed_node(session, unicast="0x0042")
    with pytest.raises(ValueError, match="unicast addr mismatch"):
        await process_sensor_reading(
            session,
            berth_id="b1",
            node_id="n1",
            mesh_unicast_addr="0x0099",
            occupied=True,
            sensor_raw=500,
        )


async def test_unicast_addr_no_registered_node_accepts(session, seeded_berth):
    """no Node row yet (e.g. status arriving during adoption window),
    skip the cross-check rather than rejecting."""
    event = await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    assert event is not None


async def test_notify_harbormasters_called_on_state_change(
    session, seeded_berth, harbor_master, monkeypatch
):
    sent: list[dict] = []

    async def _fake_send(to, subject, html, idempotency_key=None):
        sent.append({"to": to, "subject": subject, "idem": idempotency_key})

    monkeypatch.setattr("app.events.send_email", _fake_send)

    event = await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    assert event is not None
    assert len(sent) == 1
    assert sent[0]["to"] == harbor_master.email
    assert "occupied" in sent[0]["subject"].lower()
    assert event.event_id in sent[0]["idem"]


async def test_notify_harbormasters_respects_arrival_pref(
    session, seeded_berth, harbor_master, monkeypatch
):
    from app.models import UserNotificationPrefs

    prefs = UserNotificationPrefs(
        user_id=harbor_master.user_id,
        notify_arrival=False,
        notify_departure=True,
    )
    session.add(prefs)
    await session.commit()

    sent: list = []

    async def _fake_send(*a, **kw):
        sent.append(a)

    monkeypatch.setattr("app.events.send_email", _fake_send)

    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    assert sent == []


async def test_no_notification_on_same_status(
    session, seeded_berth, harbor_master, monkeypatch
):
    # b1 already free so occupied=False is noop early-returns before notify
    sent: list = []

    async def _fake_send(*a, **kw):
        sent.append(a)

    monkeypatch.setattr("app.events.send_email", _fake_send)

    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=False,
        sensor_raw=100,
    )
    assert sent == []


async def _add_window(
    session,
    *,
    window_id: str,
    berth_id: str,
    user_id: str,
    starts_hours_ago: int = 1,
    ends_hours_ahead: int = 1,
) -> None:
    now = datetime.now(UTC)
    session.add(
        BerthAvailabilityWindow(
            window_id=window_id,
            berth_id=berth_id,
            user_id=user_id,
            from_date=now - timedelta(hours=starts_hours_ago),
            return_date=now + timedelta(hours=ends_hours_ahead),
        )
    )
    await session.commit()


async def test_notify_suppressed_when_window_covers_berth(
    session, seeded_berth, harbor_master, boat_owner, monkeypatch
):
    await _add_window(
        session, window_id="w1", berth_id="b1", user_id=boat_owner.user_id
    )

    sent: list = []

    async def _fake_send(*a, **kw):
        sent.append(a)

    monkeypatch.setattr("app.events.send_email", _fake_send)

    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    assert sent == []


async def test_notify_fires_when_window_covers_different_berth(
    session, seeded_berth, harbor_master, boat_owner, monkeypatch
):
    # window exists for a sibling berth b2 in the same dock, must not suppress b1
    session.add(Berth(berth_id="b2", dock_id="d1", status="free"))
    await session.commit()
    await _add_window(
        session, window_id="w2", berth_id="b2", user_id=boat_owner.user_id
    )

    sent: list = []

    async def _fake_send(*a, **kw):
        sent.append(a)

    monkeypatch.setattr("app.events.send_email", _fake_send)

    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    assert len(sent) == 1


async def test_notify_fires_when_window_expired(
    session, seeded_berth, harbor_master, boat_owner, monkeypatch
):
    # window already closed, mooring is no longer authorized
    now = datetime.now(UTC)
    session.add(
        BerthAvailabilityWindow(
            window_id="w3",
            berth_id="b1",
            user_id=boat_owner.user_id,
            from_date=now - timedelta(hours=4),
            return_date=now - timedelta(hours=1),
        )
    )
    await session.commit()

    sent: list = []

    async def _fake_send(*a, **kw):
        sent.append(a)

    monkeypatch.setattr("app.events.send_email", _fake_send)

    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=True,
        sensor_raw=500,
    )
    assert len(sent) == 1

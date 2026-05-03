import pytest
from sqlalchemy import select

from app.events import process_heartbeat, process_sensor_reading
from app.models import Berth, Event


async def test_state_change_creates_event(session, seeded_berth):
    event = await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
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
        session, berth_id="b1", node_id="n1", occupied=True, sensor_raw=500
    )
    await process_sensor_reading(
        session, berth_id="b1", node_id="n1", occupied=False, sensor_raw=100
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
            occupied=True,
            sensor_raw=0,
        )


async def test_battery_pct_optional(session, seeded_berth):
    await process_sensor_reading(
        session, berth_id="b1", node_id="n1", occupied=True, sensor_raw=500
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


async def test_notify_harbormasters_called_on_state_change(
    session, seeded_berth, harbor_master, monkeypatch
):
    sent: list[dict] = []

    async def _fake_send(to, subject, html, idempotency_key=None):
        sent.append({"to": to, "subject": subject, "idem": idempotency_key})

    monkeypatch.setattr("app.events.send_email", _fake_send)

    event = await process_sensor_reading(
        session, berth_id="b1", node_id="n1", occupied=True, sensor_raw=500
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
        session, berth_id="b1", node_id="n1", occupied=True, sensor_raw=500
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
        session, berth_id="b1", node_id="n1", occupied=False, sensor_raw=100
    )
    assert sent == []

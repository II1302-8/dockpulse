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

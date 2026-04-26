import asyncio

from app import broadcaster
from app.events import process_heartbeat, process_sensor_reading


async def test_subscriber_receives_state_change_event(session, seeded_berth):
    async with broadcaster.subscribe() as queue:
        await process_sensor_reading(
            session,
            berth_id="b1",
            node_id="n1",
            occupied=True,
            sensor_raw=500,
            battery_pct=80,
        )
        event = await asyncio.wait_for(queue.get(), timeout=1.0)

    assert event["type"] == "berth.update"
    assert event["berth"]["berth_id"] == "b1"
    assert event["berth"]["status"] == "occupied"
    assert event["berth"]["battery_pct"] == 80


async def test_subscriber_receives_heartbeat_event(session, seeded_berth):
    async with broadcaster.subscribe() as queue:
        await process_heartbeat(session, berth_id="b1", battery_pct=42)
        event = await asyncio.wait_for(queue.get(), timeout=1.0)

    assert event["type"] == "berth.update"
    assert event["berth"]["berth_id"] == "b1"
    assert event["berth"]["battery_pct"] == 42


async def test_multiple_subscribers_each_receive_events(session, seeded_berth):
    async with broadcaster.subscribe() as q1, broadcaster.subscribe() as q2:
        await process_sensor_reading(
            session, berth_id="b1", node_id="n1", occupied=True, sensor_raw=500
        )
        e1 = await asyncio.wait_for(q1.get(), timeout=1.0)
        e2 = await asyncio.wait_for(q2.get(), timeout=1.0)

    assert e1["berth"]["status"] == "occupied"
    assert e2["berth"]["status"] == "occupied"


async def test_unsubscribe_after_context_exit(session, seeded_berth):
    async with broadcaster.subscribe():
        assert broadcaster.subscriber_count() == 1
    assert broadcaster.subscriber_count() == 0

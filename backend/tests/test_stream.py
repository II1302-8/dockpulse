import asyncio
import json

import pytest

from app import broadcaster
from app.events import process_heartbeat, process_sensor_reading


async def test_subscriber_receives_state_change_event(session, seeded_berth):
    async with broadcaster.subscribe() as queue:
        await process_sensor_reading(
            session,
            berth_id="b1",
            node_id="n1",
            mesh_unicast_addr="0x0042",
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
            session,
            berth_id="b1",
            node_id="n1",
            mesh_unicast_addr="0x0042",
            occupied=True,
            sensor_raw=500,
        )
        e1 = await asyncio.wait_for(q1.get(), timeout=1.0)
        e2 = await asyncio.wait_for(q2.get(), timeout=1.0)

    assert e1["berth"]["status"] == "occupied"
    assert e2["berth"]["status"] == "occupied"


async def test_subscriber_does_not_receive_noop_sensor_reading(session, seeded_berth):
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=False,
        sensor_raw=100,
        battery_pct=80,
    )
    async with broadcaster.subscribe() as queue:
        await process_sensor_reading(
            session,
            berth_id="b1",
            node_id="n1",
            mesh_unicast_addr="0x0042",
            occupied=False,
            sensor_raw=110,
            battery_pct=80,
        )
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(queue.get(), timeout=0.1)


async def test_subscriber_receives_battery_change_without_status_change(
    session, seeded_berth
):
    await process_sensor_reading(
        session,
        berth_id="b1",
        node_id="n1",
        mesh_unicast_addr="0x0042",
        occupied=False,
        sensor_raw=100,
        battery_pct=80,
    )
    async with broadcaster.subscribe() as queue:
        await process_sensor_reading(
            session,
            berth_id="b1",
            node_id="n1",
            mesh_unicast_addr="0x0042",
            occupied=False,
            sensor_raw=100,
            battery_pct=70,
        )
        event = await asyncio.wait_for(queue.get(), timeout=1.0)
    assert event["berth"]["battery_pct"] == 70


async def test_unsubscribe_after_context_exit(session, seeded_berth):
    async with broadcaster.subscribe():
        assert broadcaster.subscriber_count() == 1
    assert broadcaster.subscriber_count() == 0


async def test_berth_stream_first_frame_is_snapshot(session, seeded_berth):
    from app.routers.berths import stream_berths

    class _Req:
        async def is_disconnected(self):
            return False

    response = await stream_berths(_Req(), session)  # type: ignore[arg-type]
    gen = response.body_iterator
    try:
        frame = await asyncio.wait_for(gen.__anext__(), timeout=1.0)
        assert frame["event"] == "berth.snapshot"
        payload = json.loads(frame["data"])
        assert payload["type"] == "berth.snapshot"
        assert "b1" in [b["berth_id"] for b in payload["berths"]]
    finally:
        await gen.aclose()


async def test_berth_stream_loop_drops_non_berth_events(session, seeded_berth):
    # broadcaster fans every event to every queue, route must drop non-berth
    from app.routers.berths import stream_berths

    class _Req:
        async def is_disconnected(self):
            return False

    response = await stream_berths(_Req(), session)  # type: ignore[arg-type]
    gen = response.body_iterator

    snapshot = await asyncio.wait_for(gen.__anext__(), timeout=1.0)
    assert snapshot["event"] == "berth.snapshot"

    broadcaster.publish({"type": "adoption.update", "request": {"r": 1}})
    broadcaster.publish(
        {
            "type": "berth.update",
            "berth": {
                "berth_id": "b1",
                "dock_id": "d1",
                "status": "free",
                "is_reserved": False,
            },
        }
    )

    next_frame = await asyncio.wait_for(gen.__anext__(), timeout=2.0)
    payload = json.loads(next_frame["data"])
    assert payload["type"] == "berth.update"
    assert payload["berth"]["berth_id"] == "b1"

    await gen.aclose()

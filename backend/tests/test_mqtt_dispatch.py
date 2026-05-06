from sqlalchemy import select

from app.models import Berth, Event
from app.mqtt import _handle_heartbeat, _handle_status, publish_provision_req


async def test_status_handler_persists_reading(session, seeded_berth):
    payload = {
        "node_id": "n1",
        "berth_id": "b1",
        "occupied": True,
        "sensor_raw": 500,
        "battery_pct": 80,
        "timestamp": "2026-04-20T12:00:00Z",
    }
    await _handle_status(session, payload, "b1")

    berth = await session.get(Berth, "b1")
    assert berth.status == "occupied"
    assert berth.sensor_raw == 500
    assert berth.battery_pct == 80

    events = (await session.execute(select(Event))).scalars().all()
    assert len(events) == 1


async def test_status_handler_skips_on_missing_fields(session, seeded_berth):
    # missing `occupied`
    await _handle_status(session, {"node_id": "n1", "sensor_raw": 500}, "b1")
    berth = await session.get(Berth, "b1")
    assert berth.status == "free"
    assert berth.sensor_raw is None


async def test_status_handler_skips_unknown_berth(session):
    # no seeded_berth fixture — berth "b1" doesn't exist
    payload = {
        "node_id": "n1",
        "occupied": True,
        "sensor_raw": 500,
    }
    # Should not raise; ValueError is logged and swallowed.
    await _handle_status(session, payload, "b1")


async def test_heartbeat_handler_persists_battery(session, seeded_berth):
    await _handle_heartbeat(session, {"battery_pct": 73}, "b1")
    berth = await session.get(Berth, "b1")
    assert berth.battery_pct == 73
    assert berth.last_updated is not None


async def test_heartbeat_handler_skips_unknown_berth(session):
    # Should not raise.
    await _handle_heartbeat(session, {"battery_pct": 50}, "b1")


async def test_publish_provision_req_noop_when_disconnected():
    # _client is None at import so should warn and return
    await publish_provision_req(
        gateway_id="gw1",
        request_id="req-1",
        mesh_uuid="abcd" * 8,
        oob="ff" * 16,
        ttl_s=60,
        berth_id="berth-1",
    )


async def test_gateway_status_records_unknown_id_as_pending(session):
    from app.models import PendingGateway
    from app.mqtt import _handle_gateway_status

    await _handle_gateway_status(session, "gw-unregistered", {"online": True})

    pending = await session.get(PendingGateway, "gw-unregistered")
    assert pending is not None
    assert pending.attempts == 1


async def test_gateway_status_increments_attempts_on_repeat(session):
    from app.models import PendingGateway
    from app.mqtt import _handle_gateway_status

    await _handle_gateway_status(session, "gw-repeat", {"online": True})
    await _handle_gateway_status(session, "gw-repeat", {"online": False})

    pending = await session.get(PendingGateway, "gw-repeat")
    assert pending.attempts == 2


async def test_provision_state_fans_out_to_broadcaster():
    from app import broadcaster
    from app.mqtt import _handle_message

    # craft a fake message because aiomqtt.Message is awkward to construct
    class _Topic:
        value = "dockpulse/v1/gw/gw-x/provision/state"

    class _Msg:
        topic = _Topic()
        payload = b'{"req_id":"r-1","state":"link-open"}'

    received: list[dict] = []
    async with broadcaster.subscribe() as queue:
        await _handle_message(_Msg())
        # one event should be in the queue
        event = await queue.get()
        received.append(event)

    assert received == [
        {"type": "adoption.state", "request_id": "r-1", "state": "link-open"}
    ]


async def test_provision_state_ignores_malformed_payload():
    from app import broadcaster
    from app.mqtt import _handle_message

    class _Topic:
        value = "dockpulse/v1/gw/gw-x/provision/state"

    class _Msg:
        topic = _Topic()
        payload = b'{"req_id":"r-1"}'  # missing 'state'

    async with broadcaster.subscribe() as queue:
        await _handle_message(_Msg())
        # no event should be queued; check via timeout
        import asyncio

        try:
            event = await asyncio.wait_for(queue.get(), timeout=0.1)
            raise AssertionError(f"unexpected event {event}")
        except TimeoutError:
            pass

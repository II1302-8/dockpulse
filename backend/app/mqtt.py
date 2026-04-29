import asyncio
import json
import logging
import ssl

import aiomqtt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import async_session
from app.events import process_heartbeat, process_sensor_reading

logger = logging.getLogger(__name__)

_s = get_settings()
MQTT_PORT = (
    _s.mqtt_port if _s.mqtt_port is not None else (8883 if _s.mqtt_tls_ca else 1883)
)
STATUS_TOPIC = "harbor/+/+/+/status"
HEARTBEAT_TOPIC = "harbor/+/+/+/heartbeat"
RECONNECT_DELAY = 5

_connected: bool = False


def is_mqtt_connected() -> bool:
    return _connected


def _build_tls_context() -> ssl.SSLContext | None:
    s = get_settings()
    if not (s.mqtt_tls_ca and s.mqtt_tls_cert and s.mqtt_tls_key):
        return None
    ctx = ssl.create_default_context(
        purpose=ssl.Purpose.SERVER_AUTH, cafile=s.mqtt_tls_ca
    )
    ctx.load_cert_chain(certfile=s.mqtt_tls_cert, keyfile=s.mqtt_tls_key)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    return ctx


def _parse_berth_topic(topic: str) -> tuple[str, str, str, str] | None:
    parts = topic.split("/")
    # Contract: harbor/{harbor_id}/{dock_id}/{berth_id}/{kind}
    # Gateway topics share the wildcard; skip them here.
    if len(parts) != 5 or parts[0] != "harbor" or parts[2] == "gateway":
        return None
    return parts[1], parts[2], parts[3], parts[4]


async def _handle_status(session: AsyncSession, payload: dict, berth_id: str) -> None:
    node_id = payload.get("node_id")
    occupied = payload.get("occupied")
    sensor_raw = payload.get("sensor_raw")
    if node_id is None or occupied is None or sensor_raw is None:
        logger.warning("status payload missing fields for berth %s", berth_id)
        return

    try:
        event = await process_sensor_reading(
            session,
            berth_id=berth_id,
            node_id=node_id,
            occupied=bool(occupied),
            sensor_raw=int(sensor_raw),
            battery_pct=payload.get("battery_pct"),
        )
        if event:
            logger.info(
                "State change: berth %s -> %s (node=%s)",
                berth_id,
                event.event_type,
                node_id,
            )
    except ValueError as e:
        logger.warning("%s", e)


async def _handle_heartbeat(
    session: AsyncSession, payload: dict, berth_id: str
) -> None:
    try:
        await process_heartbeat(
            session,
            berth_id=berth_id,
            battery_pct=payload.get("battery_pct"),
        )
    except ValueError as e:
        logger.warning("%s", e)


async def _handle_message(message: aiomqtt.Message) -> None:
    parsed = _parse_berth_topic(message.topic.value)
    if parsed is None:
        return
    _, _, berth_id, kind = parsed

    try:
        payload = json.loads(message.payload)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Invalid JSON payload on %s", message.topic.value)
        return

    async with async_session() as session:
        if kind == "status":
            await _handle_status(session, payload, berth_id)
        elif kind == "heartbeat":
            await _handle_heartbeat(session, payload, berth_id)


async def mqtt_listener() -> None:
    global _connected
    tls_context = _build_tls_context()
    while True:
        try:
            async with aiomqtt.Client(
                get_settings().mqtt_broker, MQTT_PORT, tls_context=tls_context
            ) as client:
                _connected = True
                logger.info(
                    "Connected to MQTT broker %s:%s (tls=%s)",
                    get_settings().mqtt_broker,
                    MQTT_PORT,
                    tls_context is not None,
                )
                await client.subscribe(STATUS_TOPIC)
                await client.subscribe(HEARTBEAT_TOPIC)
                async for message in client.messages:
                    await _handle_message(message)
        except aiomqtt.MqttError as e:
            _connected = False
            logger.warning(
                "MQTT connection lost (%s), reconnecting in %ds...",
                e,
                RECONNECT_DELAY,
            )
            await asyncio.sleep(RECONNECT_DELAY)
        except Exception:
            _connected = False
            logger.exception(
                "MQTT listener crashed, reconnecting in %ds...", RECONNECT_DELAY
            )
            await asyncio.sleep(RECONNECT_DELAY)

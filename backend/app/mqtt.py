import asyncio
import json
import logging
import ssl
from datetime import UTC, datetime

import aiomqtt
from sqlalchemy.ext.asyncio import AsyncSession

from app.adoption.finalize import complete_adoption_err, complete_adoption_ok
from app.config import get_settings
from app.db import get_sessionmaker
from app.events import process_heartbeat, process_sensor_reading
from app.models import Gateway

logger = logging.getLogger(__name__)

# Legacy berth-status topics.
STATUS_TOPIC = "harbor/+/+/+/status"
HEARTBEAT_TOPIC = "harbor/+/+/+/heartbeat"

# Adoption topics, scoped under a versioned prefix so they don't collide
# with the legacy berth tree.
GATEWAY_TOPIC_PREFIX = "dockpulse/v1/gw"
PROVISION_RESP_TOPIC = f"{GATEWAY_TOPIC_PREFIX}/+/provision/resp"
GATEWAY_STATUS_TOPIC = f"{GATEWAY_TOPIC_PREFIX}/+/status"

RECONNECT_DELAY = 5
PUBLISH_QOS = 1

_connected: bool = False
_client: aiomqtt.Client | None = None


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
    if len(parts) != 5 or parts[0] != "harbor" or parts[2] == "gateway":
        return None
    return parts[1], parts[2], parts[3], parts[4]


def _parse_gateway_topic(topic: str) -> tuple[str, str] | None:
    """Return (gateway_id, kind) for dockpulse/v1/gw/{gw_id}/{...}"""
    parts = topic.split("/")
    if (
        len(parts) < 5
        or parts[0] != "dockpulse"
        or parts[1] != "v1"
        or parts[2] != "gw"
    ):
        return None
    return parts[3], "/".join(parts[4:])


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


async def _handle_provision_resp(session: AsyncSession, payload: dict) -> None:
    request_id = payload.get("req_id")
    status = payload.get("status")
    if not request_id or status not in ("ok", "err"):
        logger.warning("invalid provision/resp payload: %s", payload)
        return

    if status == "ok":
        unicast = payload.get("unicast_addr")
        dev_key_fp = payload.get("dev_key_fp")
        if not unicast or not dev_key_fp:
            logger.warning("provision/resp ok missing fields: %s", payload)
            return
        await complete_adoption_ok(
            session,
            request_id=request_id,
            mesh_unicast_addr=unicast,
            dev_key_fp=dev_key_fp,
        )
    else:
        await complete_adoption_err(
            session,
            request_id=request_id,
            error_code=payload.get("code", "unknown"),
            error_msg=payload.get("msg"),
        )


async def _handle_gateway_status(
    session: AsyncSession, gateway_id: str, payload: dict
) -> None:
    online = payload.get("online")
    if not isinstance(online, bool):
        logger.warning("gateway status payload missing 'online': %s", payload)
        return
    gateway = await session.get(Gateway, gateway_id)
    if gateway is None:
        logger.info("status for unknown gateway %s", gateway_id)
        return
    gateway.status = "online" if online else "offline"
    gateway.last_seen = datetime.now(UTC)
    await session.commit()


async def _handle_message(message: aiomqtt.Message) -> None:
    topic = message.topic.value
    try:
        payload = json.loads(message.payload)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Invalid JSON payload on %s", topic)
        return

    gateway_topic = _parse_gateway_topic(topic)
    if gateway_topic is not None:
        gateway_id, kind = gateway_topic
        async with get_sessionmaker()() as session:
            if kind == "provision/resp":
                await _handle_provision_resp(session, payload)
            elif kind == "status":
                await _handle_gateway_status(session, gateway_id, payload)
        return

    parsed = _parse_berth_topic(topic)
    if parsed is None:
        return
    _, _, berth_id, kind = parsed
    async with get_sessionmaker()() as session:
        if kind == "status":
            await _handle_status(session, payload, berth_id)
        elif kind == "heartbeat":
            await _handle_heartbeat(session, payload, berth_id)


async def publish_provision_req(
    *,
    gateway_id: str,
    request_id: str,
    mesh_uuid: str,
    oob: str,
    ttl_s: int,
) -> None:
    """Publish a provisioning command to a gateway"""
    if _client is None:
        logger.warning("MQTT not connected; provision/req for %s dropped", request_id)
        return

    topic = f"{GATEWAY_TOPIC_PREFIX}/{gateway_id}/provision/req"
    body = {
        "req_id": request_id,
        "uuid": mesh_uuid,
        "oob": oob,
        "ttl_s": ttl_s,
    }
    await _client.publish(topic, payload=json.dumps(body), qos=PUBLISH_QOS)


async def publish_decommission_req(
    *,
    gateway_id: str,
    request_id: str,
    node_id: str,
    unicast_addr: str,
    berth_id: str,
) -> None:
    """Tell a gateway to forget a node, fire-and-forget"""
    if _client is None:
        logger.warning(
            "MQTT not connected; decommission/req for %s dropped", request_id
        )
        return

    topic = f"{GATEWAY_TOPIC_PREFIX}/{gateway_id}/decommission/req"
    body = {
        "req_id": request_id,
        "node_id": node_id,
        "unicast_addr": unicast_addr,
        "berth_id": berth_id,
    }
    await _client.publish(topic, payload=json.dumps(body), qos=PUBLISH_QOS)


async def mqtt_listener() -> None:
    global _connected, _client
    s = get_settings()
    port = s.mqtt_port if s.mqtt_port is not None else (8883 if s.mqtt_tls_ca else 1883)
    tls_context = _build_tls_context()
    while True:
        try:
            async with aiomqtt.Client(
                s.mqtt_broker, port, tls_context=tls_context
            ) as client:
                _client = client
                _connected = True
                logger.info(
                    "Connected to MQTT broker %s:%s (tls=%s)",
                    s.mqtt_broker,
                    port,
                    tls_context is not None,
                )
                await client.subscribe(STATUS_TOPIC)
                await client.subscribe(HEARTBEAT_TOPIC)
                await client.subscribe(PROVISION_RESP_TOPIC)
                await client.subscribe(GATEWAY_STATUS_TOPIC)
                async for message in client.messages:
                    await _handle_message(message)
        except aiomqtt.MqttError as e:
            _connected = False
            _client = None
            logger.warning(
                "MQTT connection lost (%s), reconnecting in %ds...",
                e,
                RECONNECT_DELAY,
            )
            await asyncio.sleep(RECONNECT_DELAY)
        except Exception:
            _connected = False
            _client = None
            logger.exception(
                "MQTT listener crashed, reconnecting in %ds...", RECONNECT_DELAY
            )
            await asyncio.sleep(RECONNECT_DELAY)

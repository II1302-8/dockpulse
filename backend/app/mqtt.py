import asyncio
import json
import logging
import os

import aiomqtt

from app.db import async_session
from app.events import process_sensor_reading

logger = logging.getLogger(__name__)

MQTT_BROKER = os.environ.get("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
TOPIC = "dockpulse/+/+/status"
RECONNECT_DELAY = 5


async def _handle_message(message: aiomqtt.Message) -> None:
    parts = message.topic.value.split("/")
    if len(parts) != 4:
        logger.warning("Unexpected topic format: %s", message.topic.value)
        return

    node_id = parts[1]
    berth_id = parts[2]

    try:
        payload = json.loads(message.payload)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Invalid JSON payload on %s", message.topic.value)
        return

    status = payload.get("status")
    sensor_raw = payload.get("sensor_raw")
    if status is None or sensor_raw is None:
        logger.warning("Missing status or sensor_raw on %s", message.topic.value)
        return

    async with async_session() as session:
        try:
            event = await process_sensor_reading(
                session,
                berth_id=berth_id,
                node_id=node_id,
                status=status,
                sensor_raw=int(sensor_raw),
            )
            if event:
                logger.info(
                    "State change: berth %s -> %s (node=%s, raw=%d)",
                    berth_id,
                    event.event_type,
                    node_id,
                    sensor_raw,
                )
        except ValueError as e:
            logger.warning("%s (node=%s)", e, node_id)


async def mqtt_listener() -> None:
    while True:
        try:
            async with aiomqtt.Client(MQTT_BROKER, MQTT_PORT) as client:
                logger.info("Connected to MQTT broker %s:%s", MQTT_BROKER, MQTT_PORT)
                await client.subscribe(TOPIC)
                async for message in client.messages:
                    await _handle_message(message)
        except aiomqtt.MqttError as e:
            logger.warning(
                "MQTT connection lost (%s), reconnecting in %ds...",
                e,
                RECONNECT_DELAY,
            )
            await asyncio.sleep(RECONNECT_DELAY)

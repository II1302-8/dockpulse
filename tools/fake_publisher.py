#!/usr/bin/env python3
"""Fake MQTT publisher for Sprint 1 demos.

Publishes R3-contract-compliant berth status messages so the full stack
can be tested end-to-end without real sensor hardware.
"""

import argparse
import json
import random
import sys
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

TOPIC_PREFIX = "dockpulse/status"


def build_payload(berth_id: str, status: str) -> dict:
    return {
        "berth_id": berth_id,
        "status": status,
        "sensor_raw": random.randint(0, 1023),
        "battery_pct": random.randint(20, 100),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Publish fake berth status messages to the MQTT broker."
    )
    parser.add_argument(
        "--berth-id",
        default="berth-001",
        help="Berth identifier (default: berth-001)",
    )
    parser.add_argument(
        "--status",
        choices=["free", "occupied", "toggle"],
        default="occupied",
        help="Berth status to publish, or 'toggle' to alternate (default: occupied)",
    )
    parser.add_argument(
        "--rate",
        type=float,
        default=5.0,
        help="Publish interval in seconds (default: 5)",
    )
    parser.add_argument(
        "--host",
        default="localhost",
        help="MQTT broker host (default: localhost)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=1883,
        help="MQTT broker port (default: 1883)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=0,
        help="Number of messages to send (0 = unlimited, default: 0)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    topic = f"{TOPIC_PREFIX}/{args.berth_id}"

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    try:
        client.connect(args.host, args.port)
    except ConnectionRefusedError:
        print(f"Could not connect to MQTT broker at {args.host}:{args.port}")
        sys.exit(1)

    client.loop_start()
    sent = 0
    current_status = "free" if args.status == "toggle" else args.status
    try:
        while True:
            payload = build_payload(args.berth_id, current_status)
            client.publish(topic, json.dumps(payload))
            sent += 1
            print(f"[{sent}] {topic} -> {json.dumps(payload)}")
            if args.status == "toggle":
                current_status = "free" if current_status == "occupied" else "occupied"

            if args.count and sent >= args.count:
                break
            time.sleep(args.rate)
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()
        print(f"\nDone. Sent {sent} message(s).")


if __name__ == "__main__":
    main()

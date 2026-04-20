#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "paho-mqtt>=2.0,<3.0",
# ]
# ///
"""Fake MQTT publisher for Sprint 1 demos.

Publishes contract-compliant berth status messages so the full stack
can be tested end-to-end without real sensor hardware.

Contract: II1302-8/.github docs/mqtt-contract.yml
"""

import argparse
import json
import random
import sys
import time
from datetime import UTC, datetime

import paho.mqtt.client as mqtt

DEFAULT_HARBOR_ID = "ksss-saltsjobaden"
DEFAULT_DOCK_ID = "ksss-saltsjobaden-pier-1"

# Mirrors alembic seed migration ebf9af948b5b and the frontend harbor map.
DEFAULT_BERTH_SUFFIXES = [
    f"{side}{idx}" for side in ("t", "l", "r") for idx in range(1, 5)
]


def _node_id_for(berth_id: str) -> str:
    # berth_id format: {dock_id}-{suffix}; take the last segment as node tag.
    return f"node-{berth_id.rsplit('-', 1)[-1]}"


def build_status_payload(node_id: str, berth_id: str, occupied: bool) -> dict:
    return {
        "node_id": node_id,
        "berth_id": berth_id,
        "occupied": occupied,
        "sensor_raw": random.randint(0, 1023),
        "battery_pct": random.randint(20, 100),
        "timestamp": datetime.now(UTC).isoformat(),
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Publish fake berth status messages to the MQTT broker."
    )
    parser.add_argument("--harbor-id", default=DEFAULT_HARBOR_ID)
    parser.add_argument("--dock-id", default=DEFAULT_DOCK_ID)
    parser.add_argument(
        "--berth-id",
        default=f"{DEFAULT_DOCK_ID}-{DEFAULT_BERTH_SUFFIXES[0]}",
        help="Single berth to publish for (ignored when --all is set)",
    )
    parser.add_argument(
        "--node-id",
        default=None,
        help="Node identifier. Derived from berth-id when omitted.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Publish for every berth on the seeded harbor map (12 berths)",
    )
    parser.add_argument(
        "--status",
        choices=["free", "occupied", "toggle"],
        default="occupied",
        help="Berth status to publish, or 'toggle' to alternate (default: occupied)",
    )
    parser.add_argument(
        "--flip-prob",
        type=float,
        default=0.0,
        help=(
            "Per-berth probability (0..1) of flipping occupancy each tick. "
            "Overrides --status: initial states are randomized and each berth "
            "flips independently, so the fleet no longer moves in lockstep."
        ),
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
        help="Number of ticks to send (0 = unlimited, default: 0)",
    )
    return parser.parse_args(argv)


def _resolve_berths(args: argparse.Namespace) -> list[tuple[str, str]]:
    """Return (berth_id, node_id) tuples to publish for each tick."""
    if args.all:
        return [
            (f"{args.dock_id}-{suffix}", f"node-{suffix}")
            for suffix in DEFAULT_BERTH_SUFFIXES
        ]
    node_id = args.node_id or _node_id_for(args.berth_id)
    return [(args.berth_id, node_id)]


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    if not 0.0 <= args.flip_prob <= 1.0:
        print("--flip-prob must be between 0.0 and 1.0")
        sys.exit(2)
    berths = _resolve_berths(args)
    if args.flip_prob > 0:
        states = {
            berth_id: random.choice(["free", "occupied"]) for berth_id, _ in berths
        }
    else:
        states = {
            berth_id: "free" if args.status == "toggle" else args.status
            for berth_id, _ in berths
        }

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    try:
        client.connect(args.host, args.port)
    except ConnectionRefusedError:
        print(f"Could not connect to MQTT broker at {args.host}:{args.port}")
        sys.exit(1)

    client.loop_start()
    sent = 0
    ticks = 0
    try:
        while True:
            for berth_id, node_id in berths:
                topic = f"harbor/{args.harbor_id}/{args.dock_id}/{berth_id}/status"
                current = states[berth_id]
                occupied = current == "occupied"
                payload = build_status_payload(node_id, berth_id, occupied)
                client.publish(topic, json.dumps(payload), qos=1, retain=True)
                sent += 1
                print(f"[{sent}] {topic} -> {json.dumps(payload)}")
                if args.flip_prob > 0:
                    if random.random() < args.flip_prob:
                        states[berth_id] = "free" if occupied else "occupied"
                elif args.status == "toggle":
                    states[berth_id] = "free" if occupied else "occupied"

            ticks += 1
            if args.count and ticks >= args.count:
                break
            time.sleep(args.rate)
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()
        print(f"\nDone. Sent {sent} message(s) across {ticks} tick(s).")


if __name__ == "__main__":
    main()

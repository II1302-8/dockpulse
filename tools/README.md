# Tools

Development and testing utilities for DockPulse.

## fake_publisher.py

Publishes fake berth status messages to the MQTT broker, allowing end-to-end
testing of the backend and frontend without real sensor hardware.

### Prerequisites

Start the Mosquitto broker (from the repo root):

```bash
docker compose up mosquitto -d
```

Dependencies are declared inline via [PEP 723](https://peps.python.org/pep-0723/) and resolved automatically by `uv run`.

### Usage

```bash
# Publish "occupied" status for berth-001 every 5 seconds (default)
uv run tools/fake_publisher.py

# Publish "free" for a specific berth every 2 seconds
uv run tools/fake_publisher.py --berth-id berth-042 --status free --rate 2

# Send exactly 10 messages then exit
uv run tools/fake_publisher.py --count 10

# Alternate between free/occupied each publish (good for demos)
uv run tools/fake_publisher.py --status toggle --rate 3

# Connect to a remote broker
uv run tools/fake_publisher.py --host 192.168.1.50 --port 1883
```

### CLI flags

| Flag         | Default     | Description                      |
| ------------ | ----------- | -------------------------------- |
| `--berth-id` | `berth-001` | Berth identifier                 |
| `--status`   | `occupied`  | `free`, `occupied`, or `toggle`  |
| `--rate`     | `5`         | Publish interval in seconds      |
| `--host`     | `localhost` | MQTT broker host                 |
| `--port`     | `1883`      | MQTT broker port                 |
| `--count`    | `0`         | Messages to send (0 = unlimited) |

### Message format

Published to topic `dockpulse/status/<berth_id>`:

```json
{
  "berth_id": "berth-001",
  "status": "occupied",
  "sensor_raw": 512,
  "battery_pct": 85,
  "timestamp": "2026-04-16T14:30:00.000000+00:00"
}
```

### Verifying with mosquitto_sub

In a separate terminal, subscribe to see the messages:

```bash
docker exec dockpulse-mosquitto mosquitto_sub -t 'dockpulse/status/#' -v
```

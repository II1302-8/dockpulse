# dpcli — DockPulse Developer CLI

Admin and developer tooling for the DockPulse backend. Talks directly to the
database.

## Setup

Installed automatically when you sync the backend venv:

```bash
uv sync
dpcli --help
```

`DATABASE_URL` defaults to `postgresql+asyncpg://dockpulse:dockpulse@localhost:5432/dockpulse`.
Override via env var if needed.

## Commands

### Users

```bash
dpcli create-user --email admin@harbor.se --role harbormaster  # prompts for name + password
dpcli promote-user admin@harbor.se
dpcli demote-user admin@harbor.se
dpcli list-users
dpcli delete-user admin@harbor.se          # asks for confirmation; skip with --yes
```

### Harbor / Dock / Berths

```bash
dpcli seed-db                              # inserts h1 / d1 / b1–b5 if not present
dpcli list-harbors
dpcli list-docks
dpcli list-berths
dpcli create-berth d1 --label A3 --length 12 --width 4 --depth 2.5
```

### Berth management

```bash
dpcli berth assign user@example.com B3         # by label (errors if ambiguous)
dpcli berth assign user@example.com B3 --dock d2  # disambiguate by dock
dpcli berth unassign B3
dpcli berth reserve B3                     # suppresses sensor events and alerts
dpcli berth unreserve B3
dpcli reset-berth b3                       # force status back to free
```

### Assignments / Events / Alerts

```bash
dpcli list-assignments
dpcli list-events                          # 50 most recent; override with --limit
dpcli list-alerts
dpcli list-alerts --unacked                # unacknowledged only

dpcli create-event b1 occupied --sensor-raw 42
dpcli create-alert b1 unauthorized_mooring --message "Boat moored without assignment"
dpcli ack-alert <alert-id>
```

## Bootstrapping a fresh deploy

```bash
dpcli seed-db
dpcli create-user --email admin@harbor.se --role harbormaster
```

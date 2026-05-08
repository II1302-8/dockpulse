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
dpcli create-user --email admin@harbor.se   # prompts for password, firstname, lastname
dpcli grant-harbor admin@harbor.se h1       # promotes to harbormaster scoped to harbor h1
dpcli revoke-harbor admin@harbor.se h1      # remove harbormaster authority
dpcli list-users                             # role column derived from harbor grants
dpcli delete-user admin@harbor.se           # asks for confirmation; skip with --yes
```

A user is a harbormaster iff they have at least one row in `user_harbor_roles`. There are no global promote/demote commands — grant or revoke a harbor instead.

### Harbor / Dock / Berths

```bash
dpcli seed-db                              # dev-only fixture: h1 / d1 / b1–b5
dpcli create-harbor sthlm-vh --name "Vasahamnen" --lat 59.32 --lng 18.09
dpcli create-dock vh-d1 sthlm-vh --name "Main Dock"
dpcli list-harbors
dpcli list-docks
dpcli list-berths
dpcli create-berth vh-d1 --label A3 --length 12 --width 4 --depth 2.5
```

### Gateways

```bash
dpcli create-gateway esp32-vh-1 vh-d1 --name "Vasahamnen pier 1 gateway"
dpcli list-gateways
# status flips to 'online' once the gateway publishes
# dockpulse/v1/gw/<gateway_id>/status with {"online": true}
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
dpcli create-user --email admin@harbor.se
dpcli grant-harbor admin@harbor.se h1
```

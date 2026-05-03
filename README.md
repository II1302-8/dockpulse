# DockPulse

[![Test](https://github.com/II1302-8/dockpulse/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/II1302-8/dockpulse/actions/workflows/test.yml)
[![Lint](https://github.com/II1302-8/dockpulse/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/II1302-8/dockpulse/actions/workflows/lint.yml)
[![Build Images](https://github.com/II1302-8/dockpulse/actions/workflows/build-images.yml/badge.svg?branch=main)](https://github.com/II1302-8/dockpulse/actions/workflows/build-images.yml)

Harbor berth availability monitoring system. ESP32 nodes deployed at each berth report occupancy over MQTT, harbor masters and boat owners see live spot status in a web dashboard.

## What it does

- **Harbor masters** manage their harbor: adopt nodes, lay out spots on a map, oversee bookings.
- **Boat owners** see which spots are free in real time and reserve one.
- **Multi-tenant**: every harbor is isolated, one deployment serves many.

## Stack

```
backend/     FastAPI, SQLAlchemy, aiomqtt, Postgres
frontend/    React, TypeScript, Vite, Bun
docs/api/    OpenAPI spec
tools/       PKI helpers for the local mTLS broker
```

## Quick start

```bash
cp .env.example .env
docker compose up
```

Boots Postgres, Mosquitto (mTLS), the FastAPI backend with hot reload, and a `cert-tools` init that generates local CAs into the `mqtt-pki` volume on first run.

Frontend runs natively:

```bash
cd frontend
bun install
bun run dev
```

| Service    | URL                        |
| ---------- | -------------------------- |
| Frontend   | http://localhost:5173      |
| Backend    | http://localhost:8000      |
| Swagger UI | http://localhost:8000/docs |
| Postgres   | localhost:5432             |
| Mosquitto  | localhost:8883 (mTLS only) |

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — dev setup, workflow, team guides
- [docs/api/openapi.yml](docs/api/openapi.yml) — HTTP API contract
- [docs/db-diagram.md](docs/db-diagram.md) — database schema
- [docs/mqtt-tls.md](docs/mqtt-tls.md) — MQTT mTLS, device cert issuance, prod deploy

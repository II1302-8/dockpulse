# DockPulse

Harbor berth availability monitoring system.

## Structure

```
backend/     FastAPI + SQLAlchemy + aiomqtt
frontend/    TBD
docs/api/    OpenAPI spec
```

## Quick start

```bash
docker compose up
```

| Service    | URL / Port                 |
| ---------- | -------------------------- |
| Backend    | http://localhost:8000      |
| Swagger UI | http://localhost:8000/docs |
| Postgres   | localhost:5432             |
| Mosquitto  | localhost:1883             |
| Frontend   | http://localhost:5173      |

## Environment

Copy `.env.example` to `.env` for local development outside Docker.

## Docs

- [OpenAPI spec](docs/api/openapi.yml)

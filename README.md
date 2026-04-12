# DockPulse

Harbor berth availability monitoring system.

## Structure

```
backend/     FastAPI + SQLAlchemy + aiomqtt
frontend/    React + TypeScript + Vite
docs/api/    OpenAPI spec
```

## Quick start

```bash
cp .env.example .env
docker compose up
```

This starts the backend stack (PostgreSQL, Mosquitto, backend with hot reload).

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
| Mosquitto  | localhost:1883             |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, workflow, and team guides.

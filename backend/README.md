# DockPulse Backend

FastAPI + SQLAlchemy + aiomqtt

## Getting started

```bash
uv sync
```

Start with Docker (recommended):

```bash
docker compose up        # from repo root
```

Start standalone (requires Postgres + Mosquitto running):

```bash
uv run uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`. Swagger UI at `http://localhost:8000/docs`.

## OpenAPI spec

`docs/api/openapi.yml` is generated from the FastAPI app and committed for the
frontend's Prism mock and `openapi-typescript` codegen. Whenever you change a
route signature or a Pydantic schema, regenerate it:

```bash
uv run python -m scripts.dump_openapi
```

Pre-commit and CI both run `--check` and will fail on drift.

## Commands

| Command                                           | What it does                          |
| ------------------------------------------------- | ------------------------------------- |
| `uv sync`                                         | Install/update dependencies           |
| `uv run uvicorn app.main:app --reload`            | Start dev server                      |
| `uv run pytest`                                   | Run tests                             |
| `uv run alembic upgrade head`                     | Apply DB migrations                   |
| `uv run alembic revision --autogenerate -m "msg"` | Create migration                      |
| `uv run ruff check .`                             | Lint                                  |
| `uv run ruff format .`                            | Format                                |
| `uv run python -m scripts.dump_openapi`           | Regenerate `docs/api/openapi.yml`     |
| `uv run python -m scripts.dump_openapi --check`   | Fail if the committed spec is stale   |

## Developer CLI (dpcli)

`dpcli` is an admin CLI for managing the database directly.
Create users, seeding data, inspecting events, and managing berths from the command line.

```bash
dpcli create-user --email admin@harbor.se --role harbormaster
dpcli seed-db
dpcli list-users
dpcli berth assign user@example.com B3
```

See [`scripts/dpcli/README.md`](scripts/dpcli/README.md) for the full command reference.

## Testing

Tests run against a real PostgreSQL database (no mocks).

**Prerequisites:** Postgres running. Start it via Docker Compose from the repo root:

```bash
docker compose up db -d
```

**Run tests:**

```bash
uv run pytest
```

The conftest auto-creates `dockpulse_test` if it doesn't exist, runs `alembic upgrade head`, and truncates tables between tests. `SECRET_KEY` and `TEST_DATABASE_URL` have test-safe defaults; override either by exporting it.

## Project structure

```text
app/
├── main.py           <- FastAPI app entry point, lifespan, OpenAPI spec
├── db.py             <- SQLAlchemy engine + session
├── models.py         <- SQLAlchemy ORM models
├── schemas.py        <- Pydantic request/response schemas
├── auth.py           <- JWT creation and verification
├── events.py         <- Berth state machine and event processing
├── mqtt.py           <- MQTT listener
├── broadcaster.py    <- SSE broadcast bus
└── routers/
    ├── berths.py     <- GET /api/berths/*
    ├── docks.py      <- GET /api/docks/*
    └── users.py      <- POST /api/users/register, login, logout, refresh
```

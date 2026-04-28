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

## Commands

| Command                                           | What it does                |
| ------------------------------------------------- | --------------------------- |
| `uv sync`                                         | Install/update dependencies |
| `uv run uvicorn app.main:app --reload`            | Start dev server            |
| `uv run pytest`                                   | Run tests                   |
| `uv run alembic upgrade head`                     | Apply DB migrations         |
| `uv run alembic revision --autogenerate -m "msg"` | Create migration            |
| `uv run ruff check .`                             | Lint                        |
| `uv run ruff format .`                            | Format                      |

## Testing

Tests run against a real PostgreSQL database (no mocks).

**Prerequisites:** Postgres running with a `dockpulse_test` database. Start it via Docker Compose from the repo root:

```bash
docker compose up db -d
docker compose exec db psql -U dockpulse -c "CREATE DATABASE dockpulse_test;"
```

**Run tests:**

```bash
SECRET_KEY=any-local-secret uv run pytest -v
```

The test database URL defaults to `postgresql+asyncpg://dockpulse:dockpulse@localhost:5432/dockpulse_test`. Override with:

```bash
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@host/dbname uv run pytest
```

The test suite drops and recreates all tables on each run, so it is safe to run repeatedly.

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

# Contributing to DockPulse

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (backend)
- [Bun](https://bun.sh/) (frontend)
- [Git](https://git-scm.com/)

## Getting started

```bash
git clone git@github.com:II1302-8/dockpulse.git
cd dockpulse
cp .env.example .env

# Install pre-commit hooks (one-time setup)
cd backend && uv sync && uv run pre-commit install --install-hooks
```

Pre-commit runs Ruff lint + format automatically on every `git commit`.

### With Docker (recommended)

```bash
docker compose up
```

All services start together. Backend hot-reloads on file changes.

### Without Docker

**Backend:**

```bash
cd backend
uv sync
cp ../.env.example ../.env    # edit DATABASE_URL to point at your local Postgres
uv run uvicorn app.main:app --reload --port 8000
```

**Frontend:** (TBD)

```bash
cd frontend
bun install
bun run dev
```

## Development workflow

Follow the [project workflow](https://github.com/II1302-8/.github/blob/main/docs/WORKFLOW.md) for branching, commits, and code review.

### Quick reference

1. **Pick an issue** from the [project board](https://github.com/orgs/II1302-8/projects/1) and assign yourself
2. **Branch off main:** `git checkout -b feat/42-add-berth-endpoint`
3. **Develop** — keep changes focused on the issue
4. **Open a PR** with a Conventional Commits title: `feat(api): add berth endpoint`
5. **Get one approval**, then squash-merge

### API contract

Both teams implement against `docs/api/openapi.yml`. See [docs/api/README.md](docs/api/README.md) for the full workflow.

**Rule:** any change to `openapi.yml` must update spec + backend + frontend in the same PR.

## Backend guide

### Project structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          ← FastAPI app, OpenAPI override
│   ├── models.py         ← Pydantic schemas (mirror openapi.yml)
│   ├── db.py             ← SQLAlchemy engine + session
│   └── routes/
│       ├── health.py
│       ├── docks.py
│       ├── berths.py
│       └── alerts.py
├── alembic/               ← DB migrations
├── pyproject.toml
└── Dockerfile
```

### Adding a new endpoint

1. Add the endpoint to `docs/api/openapi.yml`
2. Add/update the Pydantic model in `models.py` to match the spec schema
3. Create the route in `routes/`
4. Test: `uv run pytest`
5. Verify against spec: `uv run schemathesis run docs/api/openapi.yml --base-url http://localhost:8000`

### Database migrations

```bash
cd backend
uv run alembic revision --autogenerate -m "add berths table"
uv run alembic upgrade head
```

### Useful commands

| Command                                | What it does                |
| -------------------------------------- | --------------------------- |
| `uv sync`                              | Install/update dependencies |
| `uv run uvicorn app.main:app --reload` | Start dev server            |
| `uv run pytest`                        | Run tests                   |
| `uv run alembic upgrade head`          | Apply migrations            |
| `uv run ruff check .`                  | Lint                        |
| `uv run ruff format .`                 | Format                      |
| `uv run ruff check . --fix`            | Lint + auto-fix             |

## Frontend guide

> **TBD**

### Linting & formatting

Use [Biome](https://biomejs.dev/) for JS/TS linting + formatting.

### Generate API types from the spec

```bash
bun run gen:api
```

This runs `openapi-typescript` against `docs/api/openapi.yml` and outputs typed interfaces to `src/api-types.ts`. Re-run whenever the spec changes.

### Mock the backend

```bash
bunx @stoplight/prism-cli mock docs/api/openapi.yml
```

Serves example responses from the spec at `http://localhost:4010`. Point your dev server's API base URL there.

## Environment variables

Defined in `.env` (copied from `.env.example`). Docker Compose reads them automatically.

| Variable            | Description      | Default     |
| ------------------- | ---------------- | ----------- |
| `POSTGRES_USER`     | DB username      | `dockpulse` |
| `POSTGRES_PASSWORD` | DB password      | `dockpulse` |
| `POSTGRES_DB`       | DB name          | `dockpulse` |
| `MQTT_BROKER`       | MQTT broker host | `localhost` |
| `MQTT_PORT`         | MQTT broker port | `1883`      |

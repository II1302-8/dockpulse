# Contributing to DockPulse

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (backend)
- [Bun](https://bun.sh/) (frontend)
- **Windows users:** use [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install) and run all commands inside WSL. Docker Desktop integrates with WSL automatically. See the [VS Code WSL guide](https://code.visualstudio.com/docs/remote/wsl) for editor setup.

## Getting started

```bash
git clone git@github.com:II1302-8/dockpulse.git
cd dockpulse
cp .env.example .env
```

### Install pre-commit hooks (one-time)

```bash
cd backend && uv sync && uv run pre-commit install --install-hooks && cd ..
```

### Start the backend stack

```bash
docker compose up
```

This starts PostgreSQL, Mosquitto, and the backend with hot reload. The backend is available at `http://localhost:8000`.

### Start the frontend

```bash
cd frontend
bun install
bun run dev
```

The frontend is available at `http://localhost:5173`. API requests to `/api/*` are proxied to the backend automatically.

If the backend isn't ready yet, use the mock server instead:

```bash
bun run dev:mock
```

This starts a mock API from the OpenAPI spec.

## Development workflow

Follow the [project workflow](https://github.com/II1302-8/.github/blob/main/docs/WORKFLOW.md) for branching, commits, and code review.

1. **Pick an issue** from the [project board](https://github.com/orgs/II1302-8/projects/1) and assign yourself
2. **Branch off main:** `git checkout -b feat/42-add-berth-endpoint`
3. **Develop** -- keep changes focused on the issue
4. **Open a PR** with a Conventional Commits title: `feat(api): add berth endpoint`
5. **Get one approval**, then squash-merge

## API contract

Both teams implement against `docs/api/openapi.yml`.

**Rule:** any change to `openapi.yml` must update spec + backend + frontend in the same PR.

## Backend

### Project structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          <- FastAPI app, OpenAPI override
│   ├── models.py         <- Pydantic schemas (mirror openapi.yml)
│   ├── db.py             <- SQLAlchemy engine + session
│   └── routes/
│       ├── health.py
│       ├── docks.py
│       ├── berths.py
│       └── alerts.py
├── alembic/               <- DB migrations
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

### Commands

| Command                                | What it does                |
| -------------------------------------- | --------------------------- |
| `uv sync`                              | Install/update dependencies |
| `uv run uvicorn app.main:app --reload` | Start dev server            |
| `uv run pytest`                        | Run tests                   |
| `uv run alembic upgrade head`          | Apply migrations            |
| `uv run ruff check .`                  | Lint                        |
| `uv run ruff format .`                 | Format                      |

## Frontend

### Commands

| Command            | What it does                                |
| ------------------ | ------------------------------------------- |
| `bun run dev`      | Start dev server (proxies to real backend)  |
| `bun run dev:mock` | Start dev server with mock API              |
| `bun run build`    | Production build to `dist/`                 |
| `bun run check`    | Type-check with tsc                         |
| `bun run lint`     | Lint with Biome                             |
| `bun run lint:fix` | Lint + auto-fix                             |
| `bun run format`   | Format with Biome                           |
| `bun run gen:api`  | Generate TypeScript types from OpenAPI spec |

### Generate API types from the spec

```bash
bun run gen:api
```

Re-run this whenever `docs/api/openapi.yml` changes.

## Environment variables

Defined in `.env` (copied from `.env.example`). Docker Compose reads them automatically.

| Variable            | Description      | Default     |
| ------------------- | ---------------- | ----------- |
| `POSTGRES_USER`     | DB username      | `dockpulse` |
| `POSTGRES_PASSWORD` | DB password      | `dockpulse` |
| `POSTGRES_DB`       | DB name          | `dockpulse` |
| `MQTT_BROKER`       | MQTT broker host | `localhost` |
| `MQTT_PORT`         | MQTT broker port | `1883`      |

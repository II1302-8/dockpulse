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

## Project structure

```
app/
├── __init__.py
├── main.py       <- FastAPI app entry point
├── models.py     <- Pydantic schemas (mirrors openapi.yml)
└── db.py         <- SQLAlchemy engine + session
```

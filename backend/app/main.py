import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI

from app.mqtt import mqtt_listener
from app.routers import berths, docks, users

SPEC_PATH = Path(__file__).parents[2] / "docs" / "api" / "openapi.yml"

logger = logging.getLogger(__name__)


def _log_task_exception(task: asyncio.Task) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("mqtt_listener task exited with exception", exc_info=exc)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logging.getLogger("app").setLevel(logging.INFO)
    task = asyncio.create_task(mqtt_listener())
    task.add_done_callback(_log_task_exception)
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(
    title="DockPulse API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.include_router(berths.router)
app.include_router(docks.router)
app.include_router(users.router)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    with open(SPEC_PATH) as f:
        app.openapi_schema = yaml.safe_load(f)
    return app.openapi_schema


app.openapi = custom_openapi


@app.get("/api/health", tags=["system"])
async def health():
    return {"status": "ok"}

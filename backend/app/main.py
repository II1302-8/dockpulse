from pathlib import Path

import yaml
from fastapi import FastAPI

from app.routers import berths

SPEC_PATH = Path(__file__).parents[2] / "docs" / "api" / "openapi.yml"

app = FastAPI(
    title="DockPulse API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.include_router(berths.router)


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

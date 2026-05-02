import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base, get_session
from app.main import app
from app.models import Berth, Dock, Harbor

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://dockpulse:dockpulse@localhost:5432/dockpulse_test",
)


@pytest.fixture(autouse=True)
def _secret_key_env(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-not-for-prod-32bytesx")


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """Settings() reads env at __init__ and is lru_cached. Drop the cache so
    tests that monkeypatch env vars (FACTORY_PUBKEY, MQTT_*, ...) get fresh
    values instead of whatever was first cached."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(TEST_DATABASE_URL)
    async with eng.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture
async def session(engine) -> AsyncIterator[AsyncSession]:
    """Clean DB between tests by truncating all tables."""
    test_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with test_session() as sess:
        yield sess
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest_asyncio.fixture
async def seeded_berth(session: AsyncSession):
    session.add_all(
        [
            Harbor(harbor_id="h1", name="Harbor 1"),
            Dock(dock_id="d1", harbor_id="h1", name="Dock 1"),
            Berth(berth_id="b1", dock_id="d1", status="free"),
        ]
    )
    await session.commit()


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

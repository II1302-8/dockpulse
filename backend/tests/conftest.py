from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app import models as _models  # noqa: F401
from app.config import get_settings
from app.db import Base, get_session
from app.main import app
from app.models import Berth, Dock, Harbor


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(get_settings().database_url)
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

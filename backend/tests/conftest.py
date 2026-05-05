import asyncio
import os

# tests must verify the strict password floor, set before any app import
os.environ.setdefault("APP_ENV", "prod")

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.config import get_settings
from app.db import Base, get_session
from app.main import app
from app.models import Berth, Dock, Gateway, Harbor, User
from tests._helpers import hash_password, make_factory_keys

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://dockpulse:dockpulse@localhost:5432/dockpulse_test",
)

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _run_alembic_upgrade(database_url: str) -> None:
    # alembic env.py runs asyncio.run so offload to thread
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")


async def _ensure_database(database_url: str) -> None:
    # CREATE DATABASE needs autocommit so go via admin db `postgres`
    url = make_url(database_url)
    target = url.database
    if not target:
        return
    admin_eng = create_async_engine(
        url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    try:
        async with admin_eng.connect() as conn:
            exists = await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": target},
            )
            if exists.scalar_one_or_none() is None:
                await conn.execute(text(f'CREATE DATABASE "{target}"'))
    finally:
        await admin_eng.dispose()


@pytest.fixture(autouse=True)
def _secret_key_env(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-not-for-prod-32bytesx")


@pytest.fixture(autouse=True)
def published_provision_reqs(monkeypatch) -> list[dict]:
    # stub mqtt publish so tests don't rely on broker being absent
    captured: list[dict] = []

    async def _fake_publish(**kwargs):
        captured.append(kwargs)

    monkeypatch.setattr("app.routers.adoptions.publish_provision_req", _fake_publish)
    return captured


@pytest.fixture(autouse=True)
def published_decommission_reqs(monkeypatch) -> list[dict]:
    captured: list[dict] = []

    async def _fake_publish(**kwargs):
        captured.append(kwargs)

    monkeypatch.setattr("app.routers.nodes.publish_decommission_req", _fake_publish)
    return captured


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    # get_settings is lru_cached so drop after env monkeypatching
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest_asyncio.fixture(scope="session")
async def engine():
    await _ensure_database(TEST_DATABASE_URL)
    eng = create_async_engine(TEST_DATABASE_URL)
    async with eng.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await asyncio.to_thread(_run_alembic_upgrade, TEST_DATABASE_URL)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture
async def session(engine) -> AsyncIterator[AsyncSession]:
    # truncate all tables between tests
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
async def harbor_world(session: AsyncSession, seeded_berth):
    # h1/d1/b1 plus online gw1 for adoption tests
    session.add(
        Gateway(gateway_id="gw1", dock_id="d1", name="Test Gateway", status="online")
    )
    await session.commit()


@pytest_asyncio.fixture
async def harbor_master(session: AsyncSession) -> User:
    user = User(
        user_id="hm1",
        firstname="Hilda",
        lastname="Master",
        email="hilda@example.com",
        password_hash=hash_password("secret"),
        role="harbormaster",
    )
    session.add(user)
    await session.commit()
    return user


@pytest_asyncio.fixture
async def boat_owner(session: AsyncSession) -> User:
    user = User(
        user_id="o1",
        firstname="Olle",
        lastname="Owner",
        email="olle@example.com",
        password_hash=hash_password("secret"),
        role="boat_owner",
    )
    session.add(user)
    await session.commit()
    return user


@pytest.fixture
def factory_pubkey(monkeypatch) -> str:
    # returns priv pem after setting FACTORY_PUBKEY env
    priv_pem, pub_pem = make_factory_keys()
    monkeypatch.setenv("FACTORY_PUBKEY", pub_pem)
    return priv_pem


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

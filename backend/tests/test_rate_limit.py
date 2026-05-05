import pytest
from httpx import AsyncClient

from app.config import get_settings
from app.rate_limit import limiter


@pytest.fixture
def enable_rate_limit(monkeypatch):
    # limiter caches enabled flag at construction so flip it directly
    monkeypatch.setattr(limiter, "enabled", True)
    monkeypatch.setenv("RATE_LIMIT_LOGIN", "3/minute")
    monkeypatch.setenv("RATE_LIMIT_REGISTER", "2/minute")
    get_settings.cache_clear()
    limiter.reset()
    yield
    limiter.reset()


async def test_login_rate_limit_returns_429(
    client: AsyncClient, enable_rate_limit
):
    payload = {"email": "nobody@example.com", "password": "wrong-password"}
    for _ in range(3):
        r = await client.post("/api/auth/login", json=payload)
        assert r.status_code == 401
    r = await client.post("/api/auth/login", json=payload)
    assert r.status_code == 429


async def test_register_rate_limit_returns_429(
    client: AsyncClient, enable_rate_limit
):
    base = {
        "firstname": "Rina",
        "lastname": "Limit",
        "phone": "0701234567",
        "boat_club": "RBK",
        "password": "longenoughpassword",
    }
    for i in range(2):
        r = await client.post(
            "/api/auth/register", json={**base, "email": f"r{i}@example.com"}
        )
        assert r.status_code == 201
    r = await client.post(
        "/api/auth/register", json={**base, "email": "r-blocked@example.com"}
    )
    assert r.status_code == 429

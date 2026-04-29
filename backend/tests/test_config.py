import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings

_SECRET = "a-strong-secret-key-for-testing-purposes"
_DB = "postgresql+asyncpg://dockpulse:dockpulse@localhost:5432/dockpulse_test"


def test_loads_jwt_secret_from_env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", _SECRET)
    monkeypatch.setenv("DATABASE_URL", _DB)
    s = Settings(_env_file=None)
    assert s.jwt_secret_key.get_secret_value() == _SECRET


def test_missing_jwt_secret_raises(monkeypatch):
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    monkeypatch.setenv("DATABASE_URL", _DB)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_missing_database_url_raises(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", _SECRET)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_weak_jwt_secret_raises(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "tooshort")
    monkeypatch.setenv("DATABASE_URL", _DB)
    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(_env_file=None)


def test_secret_is_masked(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", _SECRET)
    monkeypatch.setenv("DATABASE_URL", _DB)
    s = Settings(_env_file=None)
    assert _SECRET not in str(s)
    assert _SECRET not in repr(s)


def test_defaults(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", _SECRET)
    monkeypatch.setenv("DATABASE_URL", _DB)
    s = Settings(_env_file=None)
    assert s.mqtt_broker == "localhost"
    assert s.mqtt_port is None
    assert s.mqtt_tls_ca is None
    assert s.mqtt_tls_cert is None
    assert s.mqtt_tls_key is None


def test_overrides(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", _SECRET)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://other/db")
    monkeypatch.setenv("MQTT_BROKER", "broker.example.com")
    monkeypatch.setenv("MQTT_PORT", "1234")
    s = Settings(_env_file=None)
    assert s.mqtt_broker == "broker.example.com"
    assert s.mqtt_port == 1234
    assert s.database_url == "postgresql+asyncpg://other/db"


def test_get_settings_is_cached(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("JWT_SECRET_KEY", _SECRET)
    monkeypatch.setenv("DATABASE_URL", _DB)
    assert get_settings() is get_settings()
    get_settings.cache_clear()

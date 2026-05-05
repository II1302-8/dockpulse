import pytest
from pydantic import ValidationError

from app.config import SECRET_KEY_MIN_LEN, Settings


def test_mqtt_settings_default_broker():
    assert Settings().mqtt_broker == "localhost"


def test_mqtt_settings_tls_fields_default_to_none():
    s = Settings()
    assert s.mqtt_tls_ca is None
    assert s.mqtt_tls_cert is None
    assert s.mqtt_tls_key is None


def test_mqtt_port_defaults_to_none():
    assert Settings().mqtt_port is None


def test_mqtt_settings_read_from_env(monkeypatch):
    monkeypatch.setenv("MQTT_BROKER", "mqtt.example.com")
    monkeypatch.setenv("MQTT_PORT", "1883")
    s = Settings()
    assert s.mqtt_broker == "mqtt.example.com"
    assert s.mqtt_port == 1883


@pytest.mark.parametrize(
    "value",
    ["", "changeme", "secret", "cli-unused", "CHANGEME", "  changeme  "],
)
def test_secret_key_rejects_placeholders(monkeypatch, value):
    monkeypatch.setenv("SECRET_KEY", value)
    with pytest.raises(ValidationError, match="placeholder"):
        Settings()


def test_secret_key_rejects_short_value(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "x" * (SECRET_KEY_MIN_LEN - 1))
    with pytest.raises(ValidationError, match="at least"):
        Settings()


def test_secret_key_accepts_long_random_value(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "a" * SECRET_KEY_MIN_LEN)
    assert Settings().secret_key == "a" * SECRET_KEY_MIN_LEN


def test_cors_allowed_origins_default_empty():
    assert Settings().cors_allowed_origins == []


def test_cors_allowed_origins_parses_csv(monkeypatch):
    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS",
        "https://app.dockpulse.xyz, https://staging.dockpulse.xyz",
    )
    s = Settings()
    assert s.cors_allowed_origins == [
        "https://app.dockpulse.xyz",
        "https://staging.dockpulse.xyz",
    ]


def test_cors_allowed_origins_skips_blanks(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", " , https://a.example , ,")
    assert Settings().cors_allowed_origins == ["https://a.example"]

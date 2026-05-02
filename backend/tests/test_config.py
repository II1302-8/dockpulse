from app.config import Settings


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

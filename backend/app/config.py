from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    secret_key: str
    database_url: str = (
        "postgresql+asyncpg://dockpulse:dockpulse@localhost:5432/dockpulse"
    )
    mqtt_broker: str = "localhost"
    mqtt_tls_ca: str | None = None
    mqtt_tls_cert: str | None = None
    mqtt_tls_key: str | None = None
    mqtt_port: int | None = None
    factory_pubkey: str | None = None
    resend_api_key: str | None = None
    email_from: str = "DockPulse <noreply@dockpulse.xyz>"


@lru_cache
def get_settings() -> Settings:
    return Settings()

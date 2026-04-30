from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    secret_key: str
    database_url: str = (
        "postgresql+asyncpg://dockpulse:dockpulse@localhost:5432/dockpulse"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

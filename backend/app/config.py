from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# 32 bytes matches the HS256 key length recommendation (RFC 7518 §3.2)
SECRET_KEY_MIN_LEN = 32

# placeholders that must never reach prod
_FORBIDDEN_SECRETS = frozenset(
    {
        "",
        "changeme",
        "change-me",
        "secret",
        "cli-unused",
        "test-secret",
        "dev-secret",
    }
)


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
    # gates side effects that must not run outside prod (real email, etc)
    app_env: Literal["dev", "staging", "prod"] = "dev"
    resend_api_key: str | None = None
    email_from: str = "DockPulse <noreply@dockpulse.xyz>"
    # csv origins, empty disables CORS middleware (vite proxy makes dev same-origin)
    cors_allowed_origins: Annotated[list[str], NoDecode] = []
    # per-ip throttle for credential brute-force
    # proxy deploys need uvicorn --forwarded-allow-ips so client.host is real ip
    rate_limit_login: str = "10/minute"
    rate_limit_register: str = "5/hour"
    # global kill-switch so tests don't have to override every endpoint
    rate_limit_enabled: bool = True

    @field_validator("secret_key")
    @classmethod
    def _validate_secret_key(cls, v: str) -> str:
        if v.strip().lower() in _FORBIDDEN_SECRETS:
            raise ValueError(
                "SECRET_KEY is a known placeholder; set a real value"
            )
        if len(v) < SECRET_KEY_MIN_LEN:
            raise ValueError(
                f"SECRET_KEY must be at least {SECRET_KEY_MIN_LEN} chars "
                f"(got {len(v)})"
            )
        return v

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, v: object) -> object:
        # env vars come in as comma-separated strings
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()

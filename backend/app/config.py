from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
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
    # gates side effects that must not run outside prod (real email, etc)
    app_env: Literal["dev", "staging", "prod"] = "dev"
    resend_api_key: str | None = None
    email_from: str = "DockPulse <noreply@dockpulse.xyz>"
    # base URL for email links (verification, password reset, invites).
    # explicit env var wins; the default below is replaced per app_env in the
    # model_validator so forgetting to set APP_BASE_URL in prod doesn't ship
    # localhost links in transactional emails
    app_base_url: str = ""
    verification_token_ttl_hours: int = 24
    # per-ip throttle for the unauthenticated reset-request endpoint
    rate_limit_password_reset: str = "5/hour"
    invitation_token_ttl_hours: int = 336
    # csv origins, empty disables CORS middleware (vite proxy makes dev same-origin)
    cors_allowed_origins: Annotated[list[str], NoDecode] = []
    # per-ip throttle for credential brute-force
    # proxy deploys need uvicorn --forwarded-allow-ips so client.host is real ip
    rate_limit_login: str = "10/minute"
    rate_limit_register: str = "5/hour"
    # logged-in pw change still wants a ceiling so a stolen cookie can't drive
    # offline-test rounds via the authed endpoint
    rate_limit_password_change: str = "10/hour"
    # adoption is auth-protected but a compromised harbormaster cookie can
    # still flood random QR pastes (JWT verify + pending row + mqtt publish)
    rate_limit_adopt: str = "20/minute"
    # global kill-switch so tests don't have to override every endpoint
    rate_limit_enabled: bool = True
    # short access ttl narrows xss / leaked-token blast radius
    access_token_ttl_minutes: int = 15
    # refresh ttl is rolling, rotation issues a fresh full-length token
    refresh_token_ttl_days: int = 14
    # None lets cookie_secure derive from app_env, override for tunnels in staging
    cookie_secure: bool | None = None
    cookie_domain: str | None = None
    # both unset = /api/admin/* always 401
    # team_domain example: https://dockpulse.cloudflareaccess.com
    # aud is the application AUD tag from cf access dashboard
    cf_access_team_domain: str | None = None
    cf_access_aud: str | None = None

    @property
    def cookies_require_https(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure
        return self.app_env == "prod"

    @field_validator("secret_key")
    @classmethod
    def _validate_secret_key(cls, v: str) -> str:
        if v.strip().lower() in _FORBIDDEN_SECRETS:
            raise ValueError("SECRET_KEY is a known placeholder; set a real value")
        if len(v) < SECRET_KEY_MIN_LEN:
            raise ValueError(
                f"SECRET_KEY must be at least {SECRET_KEY_MIN_LEN} chars (got {len(v)})"
            )
        return v

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, v: object) -> object:
        # env vars come in as comma-separated strings
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _resolve_app_base_url(self) -> "Settings":
        # fall back per app_env so emails always link to a sensible host even
        # when APP_BASE_URL wasn't wired through the deployment env
        if not self.app_base_url:
            self.app_base_url = {
                "prod": "https://dockpulse.xyz",
                "staging": "https://staging.dockpulse.xyz",
                "dev": "http://localhost:5173",
            }[self.app_env]
        if not self.app_base_url.startswith(("http://", "https://")):
            raise ValueError("APP_BASE_URL must start with http:// or https://")
        self.app_base_url = self.app_base_url.rstrip("/")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

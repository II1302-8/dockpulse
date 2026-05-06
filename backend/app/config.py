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

    @field_validator("factory_pubkey", mode="before")
    @classmethod
    def _decode_pubkey(cls, v: object) -> object:
        # accept three input shapes from env so every deploy target
        # works regardless of dotenv-parser quirks:
        #   1. real PEM with newlines (works on Compose v2.24+)
        #   2. single-line with literal "\n" separators (older Compose)
        #   3. base64-encoded PEM (Komodo, Coolify, anything that
        #      tokenises on whitespace or chokes on dashes)
        if not isinstance(v, str) or not v:
            return v
        if v.lstrip().startswith("-----BEGIN"):
            if "\\n" in v:
                return v.replace("\\n", "\n")
            return v
        # base64: decode and trust the PEM loader to validate. tolerate
        # whitespace/newlines that some platforms inject mid-string
        import base64
        import binascii

        try:
            decoded = base64.b64decode("".join(v.split()), validate=True).decode()
        except (binascii.Error, UnicodeDecodeError) as err:
            raise ValueError(
                "FACTORY_PUBKEY is neither a PEM nor valid base64"
            ) from err
        if not decoded.lstrip().startswith("-----BEGIN"):
            raise ValueError("FACTORY_PUBKEY base64 did not decode to a PEM")
        return decoded


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""verify Cf-Access-Jwt-Assertion for /api/admin/*

cf attaches the signed jwt at the edge after sso, backend validates against
team jwks. signature + audience + issuer + standard exp/iat/nbf

ref https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
"""

import logging
import time
from dataclasses import dataclass

import jwt
from jwt import PyJWKClient, PyJWKClientError

from app.config import get_settings

logger = logging.getLogger(__name__)

# library refetches on key-not-found so 1h is fine even if cf rotates
JWKS_CACHE_TTL_S = 3600
HEADER = "Cf-Access-Jwt-Assertion"


class AccessAuthError(Exception):
    """missing or invalid cf access assertion"""


@dataclass(frozen=True)
class AccessIdentity:
    # email is None for service-token assertions (factory-flash, CI, etc.)
    email: str | None
    sub: str  # cf user id or service-token client id
    # set on service-token assertions to the token's display name
    service_token: str | None = None

    @property
    def display(self) -> str:
        return self.email or f"service:{self.service_token or self.sub}"


_jwks_clients: dict[str, PyJWKClient] = {}


def _jwks_client(team_domain: str) -> PyJWKClient:
    if team_domain not in _jwks_clients:
        url = f"{team_domain.rstrip('/')}/cdn-cgi/access/certs"
        _jwks_clients[team_domain] = PyJWKClient(
            url,
            cache_keys=True,
            lifespan=JWKS_CACHE_TTL_S,
            timeout=5.0,
        )
    return _jwks_clients[team_domain]


def verify_assertion(token: str) -> AccessIdentity:
    """raises AccessAuthError on any validation failure"""
    s = get_settings()
    if not s.cf_access_team_domain or not s.cf_access_aud:
        raise AccessAuthError("CF Access not configured on this server")
    if not token:
        raise AccessAuthError("missing assertion")

    try:
        client = _jwks_client(s.cf_access_team_domain)
        signing_key = client.get_signing_key_from_jwt(token).key
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=s.cf_access_aud,
            issuer=s.cf_access_team_domain.rstrip("/"),
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except PyJWKClientError as err:
        raise AccessAuthError(f"jwks fetch failed: {err}") from err
    except jwt.PyJWTError as err:
        raise AccessAuthError(f"invalid assertion: {err}") from err

    email = payload.get("email")
    common_name = payload.get("common_name")
    # service-token assertions carry common_name + no email, human SSO carries
    # email + no common_name; require at least one
    if not isinstance(email, str) or not email:
        if not isinstance(common_name, str) or not common_name:
            raise AccessAuthError("assertion missing email or common_name claim")
        return AccessIdentity(email=None, sub=payload["sub"], service_token=common_name)
    return AccessIdentity(email=email, sub=payload["sub"])


def _now_s() -> int:
    # patch point for time-based tests
    return int(time.time())

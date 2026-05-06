"""Cloudflare Access JWT verification

Used by the /api/admin/* endpoints — Cloudflare attaches a signed JWT in the
Cf-Access-Jwt-Assertion header on every request from a Zero-Trust-authenticated
browser. Backend validates: signature against the team's JWKS, audience against
the app's AUD tag, issuer matches the team domain, and standard exp/iat/nbf.

Reference: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
"""

import logging
import time
from dataclasses import dataclass

import httpx
import jwt
from jwt import PyJWKClient

from app.config import get_settings

logger = logging.getLogger(__name__)

# JWKS cache TTL: CF rotates per-app keys infrequently but we don't want to
# pin forever. Library refetches on key-not-found anyway.
JWKS_CACHE_TTL_S = 3600
HEADER = "Cf-Access-Jwt-Assertion"


class AccessAuthError(Exception):
    """Caller is missing or has an invalid CF Access assertion"""


@dataclass(frozen=True)
class AccessIdentity:
    email: str
    sub: str  # CF user id


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
    """Validate a Cf-Access-Jwt-Assertion. Returns the identity or raises."""
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
    except jwt.PyJWTError as err:
        raise AccessAuthError(f"invalid assertion: {err}") from err
    except httpx.HTTPError as err:
        raise AccessAuthError(f"jwks fetch failed: {err}") from err

    email = payload.get("email")
    if not isinstance(email, str) or not email:
        raise AccessAuthError("assertion missing email claim")

    return AccessIdentity(email=email, sub=payload["sub"])


def _now_s() -> int:
    # extracted so tests can patch
    return int(time.time())

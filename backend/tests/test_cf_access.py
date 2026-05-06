"""Tests for the Cloudflare Access JWT verifier + admin auth gate.

JWKS is mocked locally so the test never touches the network — we generate
an RSA keypair, build a JWKS document around the public key, sign tokens
with the private key, and patch PyJWKClient.fetch_data to return our JWKS.
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import AsyncClient
from jwt import PyJWKClient
from jwt.utils import to_base64url_uint

from app import cf_access

TEAM = "https://dockpulse.cloudflareaccess.com"
AUD = "test-aud-tag"
KID = "test-kid"


@pytest.fixture
def cf_keys(monkeypatch):
    """Generate RSA keypair, point cf_access at a fake JWKS for it."""
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pub = priv.public_key()
    nums = pub.public_numbers()
    jwk = {
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": KID,
        "n": to_base64url_uint(nums.n).decode(),
        "e": to_base64url_uint(nums.e).decode(),
    }
    jwks = {"keys": [jwk]}

    monkeypatch.setattr(PyJWKClient, "fetch_data", lambda self: jwks)
    # clear the module-level cache so test ordering doesn't matter
    cf_access._jwks_clients.clear()

    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", TEAM)
    monkeypatch.setenv("CF_ACCESS_AUD", AUD)
    # settings is lru_cache'd; tests already clear it via the get_settings fixture
    from app.config import get_settings

    get_settings.cache_clear()

    return priv


def _mint(priv, **overrides) -> str:
    now = int(time.time())
    payload = {
        "iss": TEAM,
        "aud": AUD,
        "sub": "user-abc",
        "email": "ops@dockpulse.xyz",
        "iat": now,
        "exp": now + 300,
        **overrides,
    }
    return jwt.encode(
        payload,
        priv,
        algorithm="RS256",
        headers={"kid": KID},
    )


def test_verify_accepts_valid_assertion(cf_keys):
    token = _mint(cf_keys)
    identity = cf_access.verify_assertion(token)
    assert identity.email == "ops@dockpulse.xyz"
    assert identity.sub == "user-abc"


def test_verify_rejects_expired(cf_keys):
    token = _mint(cf_keys, exp=int(time.time()) - 60)
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_rejects_wrong_aud(cf_keys):
    token = _mint(cf_keys, aud="some-other-app")
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_rejects_wrong_issuer(cf_keys):
    token = _mint(cf_keys, iss="https://attacker.cloudflareaccess.com")
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_rejects_missing_email(cf_keys):
    token = _mint(cf_keys, email=None)
    # PyJWT serialises None as null which still satisfies require=email,
    # so handler falls through to the explicit isinstance check
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_errors_when_unconfigured(monkeypatch):
    monkeypatch.delenv("CF_ACCESS_TEAM_DOMAIN", raising=False)
    monkeypatch.delenv("CF_ACCESS_AUD", raising=False)
    from app.config import get_settings

    get_settings.cache_clear()
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion("any.jwt.here")


# ---- admin router auth gate ----


async def test_admin_snapshot_rejects_missing_header(client: AsyncClient, cf_keys):
    r = await client.get("/api/admin/snapshot")
    assert r.status_code == 401
    assert "Cf-Access-Jwt-Assertion" in r.json()["detail"]


async def test_admin_snapshot_rejects_invalid_token(client: AsyncClient, cf_keys):
    r = await client.get(
        "/api/admin/snapshot",
        headers={"Cf-Access-Jwt-Assertion": "not.a.valid.jwt"},
    )
    assert r.status_code == 401


async def test_admin_snapshot_returns_state(client: AsyncClient, cf_keys, harbor_world):
    token = _mint(cf_keys)
    r = await client.get(
        "/api/admin/snapshot",
        headers={"Cf-Access-Jwt-Assertion": token},
    )
    assert r.status_code == 200
    body = r.json()
    assert "gateways" in body
    assert "nodes" in body
    assert "pending_gateways" in body
    assert body["adoption"]["pending"] == 0

"""shared fixtures for admin endpoint tests, jwks mocked in-process

generates an rsa keypair, builds a jwks document around the public key,
signs tokens with the private key, patches PyJWKClient.fetch_data so the
suite never touches the network
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt import PyJWKClient
from jwt.utils import to_base64url_uint

from app import cf_access

TEAM = "https://dockpulse.cloudflareaccess.com"
AUD = "test-aud-tag"
KID = "test-kid"


@pytest.fixture
def cf_keys(monkeypatch):
    """generate rsa keypair, point cf_access at a fake jwks built from it"""
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
    cf_access._jwks_clients.clear()

    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", TEAM)
    monkeypatch.setenv("CF_ACCESS_AUD", AUD)
    from app.config import get_settings

    get_settings.cache_clear()

    return priv


@pytest.fixture
def mint(cf_keys):
    """callable minting cf access jwts signed by the test key

    pass overrides to drive rejection tests, e.g. mint(exp=..., aud=...)
    """

    def _mint(**overrides) -> str:
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
            cf_keys,
            algorithm="RS256",
            headers={"kid": KID},
        )

    return _mint


@pytest.fixture
def auth_headers(mint):
    """happy-path admin headers, tests needing custom payloads call mint() directly"""
    return {"Cf-Access-Jwt-Assertion": mint()}

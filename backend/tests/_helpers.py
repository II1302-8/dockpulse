"""shared test helpers, pure functions only"""

from __future__ import annotations

import base64
import json
import os
import time

import jwt
from argon2 import PasswordHasher
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

from app.adoption.claims import ALGORITHM as FACTORY_JWT_ALGORITHM

AUTH_JWT_ALGORITHM = "HS256"

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(hash_: str, password: str) -> bool:
    return _ph.verify(hash_, password)


def make_auth_token(user_id: str, token_version: int = 0) -> str:
    return jwt.encode(
        {"sub": user_id, "ver": token_version},
        os.environ["SECRET_KEY"],
        algorithm=AUTH_JWT_ALGORITHM,
    )


def auth_cookies(user_id: str, token_version: int = 0) -> dict[str, str]:
    # csrf value is arbitrary, conftest event hook echoes the cookie back as a header
    return {
        "dockpulse_access": make_auth_token(user_id, token_version),
        "dockpulse_csrf": "test-csrf",
    }


def make_factory_keys() -> tuple[str, str]:
    priv = Ed25519PrivateKey.generate()
    priv_pem = priv.private_bytes(
        Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
    ).decode()
    pub_pem = (
        priv.public_key()
        .public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )
    return priv_pem, pub_pem


def make_qr_payload(priv_pem: str, **claim_overrides) -> str:
    now = int(time.time())
    claim = {
        "iss": "factory",
        "sub": "DP-N-000123",
        "uuid": "0123456789abcdef0123456789abcdef",
        "jti": "claim-jti-1",
        "iat": now,
        "exp": now + 3600,
    }
    claim.update(claim_overrides)
    token = jwt.encode(claim, priv_pem, algorithm=FACTORY_JWT_ALGORITHM)
    qr = {
        "v": 1,
        "uuid": claim["uuid"],
        "oob": "00112233445566778899aabbccddeeff",
        "sn": claim["sub"],
        "jwt": token,
    }
    raw = json.dumps(qr).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

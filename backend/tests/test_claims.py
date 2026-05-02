import time
from datetime import UTC, datetime

import jwt
import pytest

from app.adoption.claims import ALGORITHM, ClaimError, verify_claim_jwt
from tests._helpers import make_factory_keys


@pytest.fixture
def factory_keys(monkeypatch):
    priv_pem, pub_pem = make_factory_keys()
    monkeypatch.setenv("FACTORY_PUBKEY", pub_pem)
    return priv_pem, pub_pem


def _claim_payload(**overrides) -> dict:
    now = int(time.time())
    base = {
        "iss": "factory",
        "sub": "DP-N-000123",
        "uuid": "0123456789abcdef0123456789abcdef",
        "jti": "claim-jti-1",
        "iat": now,
        "exp": now + 3600,
    }
    base.update(overrides)
    return base


def test_verify_returns_claim_on_valid_token(factory_keys):
    priv, _ = factory_keys
    token = jwt.encode(_claim_payload(), priv, algorithm=ALGORITHM)

    claim = verify_claim_jwt(token)

    assert claim.serial_number == "DP-N-000123"
    assert claim.mesh_uuid == "0123456789abcdef0123456789abcdef"
    assert claim.jti == "claim-jti-1"
    assert claim.expires_at > datetime.now(UTC).replace(tzinfo=None)


def test_verify_rejects_bad_signature(factory_keys):
    other_priv, _ = make_factory_keys()
    token = jwt.encode(_claim_payload(), other_priv, algorithm=ALGORITHM)

    with pytest.raises(ClaimError):
        verify_claim_jwt(token)


def test_verify_rejects_expired_token(factory_keys):
    priv, _ = factory_keys
    expired = _claim_payload(
        iat=int(time.time()) - 7200,
        exp=int(time.time()) - 3600,
    )
    token = jwt.encode(expired, priv, algorithm=ALGORITHM)

    with pytest.raises(ClaimError, match="expired"):
        verify_claim_jwt(token)


def test_verify_rejects_wrong_issuer(factory_keys):
    priv, _ = factory_keys
    token = jwt.encode(_claim_payload(iss="attacker"), priv, algorithm=ALGORITHM)

    with pytest.raises(ClaimError, match="issuer"):
        verify_claim_jwt(token)


def test_verify_rejects_missing_required_claim(factory_keys):
    priv, _ = factory_keys
    payload = _claim_payload()
    del payload["jti"]
    token = jwt.encode(payload, priv, algorithm=ALGORITHM)

    with pytest.raises(ClaimError, match="jti"):
        verify_claim_jwt(token)


def test_verify_rejects_missing_uuid(factory_keys):
    priv, _ = factory_keys
    payload = _claim_payload()
    del payload["uuid"]
    token = jwt.encode(payload, priv, algorithm=ALGORITHM)

    with pytest.raises(ClaimError, match="uuid"):
        verify_claim_jwt(token)


def test_verify_rejects_hs256_signed_token(factory_keys):
    """A token signed with a symmetric algorithm must not authenticate."""
    token = jwt.encode(_claim_payload(), "shared-secret", algorithm="HS256")

    with pytest.raises(ClaimError):
        verify_claim_jwt(token)


def test_verify_raises_when_pubkey_not_configured(monkeypatch):
    monkeypatch.delenv("FACTORY_PUBKEY", raising=False)
    priv, _ = make_factory_keys()
    token = jwt.encode(_claim_payload(), priv, algorithm=ALGORITHM)

    with pytest.raises(ClaimError, match="FACTORY_PUBKEY"):
        verify_claim_jwt(token)


def test_verify_rejects_token_not_yet_valid(factory_keys):
    """Tokens with iat/nbf in the future are rejected by PyJWT defaults."""
    priv, _ = factory_keys
    future = _claim_payload(
        iat=int(time.time()) + 3600,
        nbf=int(time.time()) + 3600,
        exp=int(time.time()) + 7200,
    )
    token = jwt.encode(future, priv, algorithm=ALGORITHM)

    with pytest.raises(ClaimError):
        verify_claim_jwt(token)

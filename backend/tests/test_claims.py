import time
import uuid
from datetime import UTC, datetime

import base45
import cbor2
import pytest

from app.adoption.claims import ClaimError, verify_claim
from app.adoption.cose import encode_sign1
from tests._helpers import (
    DEFAULT_JTI,
    DEFAULT_SERIAL,
    _priv_from_pem,
    make_factory_keys,
    make_qr_payload,
)


@pytest.fixture
def factory_keys(monkeypatch):
    priv_pem, pub_pem = make_factory_keys()
    monkeypatch.setenv("FACTORY_PUBKEY", pub_pem)
    return priv_pem, pub_pem


def test_verify_returns_claim_on_valid_token(factory_keys):
    priv, _ = factory_keys
    qr = make_qr_payload(priv)

    claim = verify_claim(qr)

    assert claim.serial_number == DEFAULT_SERIAL
    assert claim.jti == DEFAULT_JTI
    assert claim.expires_at > datetime.now(UTC)


def test_verify_rejects_bad_base45(factory_keys):
    with pytest.raises(ClaimError, match="base45"):
        verify_claim("!! not base45 !!")


def test_verify_rejects_bad_signature(factory_keys):
    other_priv, _ = make_factory_keys()
    qr = make_qr_payload(other_priv)

    with pytest.raises(ClaimError, match="signature"):
        verify_claim(qr)


def test_verify_rejects_expired_claim(factory_keys):
    priv, _ = factory_keys
    qr = make_qr_payload(priv, exp_offset_s=-60)

    with pytest.raises(ClaimError, match="expired"):
        verify_claim(qr)


def test_verify_rejects_non_cose_blob(factory_keys):
    # base45-encode a plain CBOR int — valid base45 + valid CBOR but not a COSE_Sign1
    not_cose = base45.b45encode(cbor2.dumps(42)).decode()

    with pytest.raises(ClaimError, match="COSE_Sign1"):
        verify_claim(not_cose)


def test_verify_rejects_wrong_alg(factory_keys):
    priv, _ = factory_keys
    # build a Sign1 manually with alg=ES256 (-7) instead of EdDSA (-8)
    payload = cbor2.dumps(
        {1: DEFAULT_SERIAL, 2: uuid.UUID(DEFAULT_JTI).bytes, 3: int(time.time()) + 3600}
    )
    protected = cbor2.dumps({1: -7})
    fake_blob = cbor2.dumps(cbor2.CBORTag(18, [protected, {}, payload, b"\x00" * 64]))
    qr = base45.b45encode(fake_blob).decode()

    with pytest.raises(ClaimError, match="EdDSA"):
        verify_claim(qr)


def test_verify_rejects_missing_serial(factory_keys):
    priv, _ = factory_keys
    payload = cbor2.dumps({2: uuid.UUID(DEFAULT_JTI).bytes, 3: int(time.time()) + 3600})
    blob = encode_sign1(payload, _priv_from_pem(priv))
    qr = base45.b45encode(blob).decode()

    with pytest.raises(ClaimError, match="serial"):
        verify_claim(qr)


def test_verify_rejects_missing_jti(factory_keys):
    priv, _ = factory_keys
    payload = cbor2.dumps({1: DEFAULT_SERIAL, 3: int(time.time()) + 3600})
    blob = encode_sign1(payload, _priv_from_pem(priv))
    qr = base45.b45encode(blob).decode()

    with pytest.raises(ClaimError, match="jti"):
        verify_claim(qr)


def test_verify_rejects_missing_exp(factory_keys):
    priv, _ = factory_keys
    payload = cbor2.dumps({1: DEFAULT_SERIAL, 2: uuid.UUID(DEFAULT_JTI).bytes})
    blob = encode_sign1(payload, _priv_from_pem(priv))
    qr = base45.b45encode(blob).decode()

    with pytest.raises(ClaimError, match="exp"):
        verify_claim(qr)


def test_verify_raises_when_pubkey_not_configured(monkeypatch):
    monkeypatch.delenv("FACTORY_PUBKEY", raising=False)
    priv, _ = make_factory_keys()
    qr = make_qr_payload(priv)

    with pytest.raises(ClaimError, match="FACTORY_PUBKEY"):
        verify_claim(qr)

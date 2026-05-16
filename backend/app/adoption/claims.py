"""Verifies factory-signed claim blobs from node QR codes.

QR payload is base45-encoded COSE_Sign1 (Ed25519). Map keys are
single-byte ints to keep the binary compact:

    {1: serial_bytes, 2: jti_bytes(16), 3: exp_unix_int}

uuid + oob are NOT in the QR; backend looks them up by serial via the
FactoryDevice table populated at factory-flash time. This keeps the QR
small enough to fit on a 25mm sticker without losing scan margin.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import base45
import cbor2
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from app.adoption.cose import CoseError, decode_and_verify_sign1
from app.config import get_settings

# CBOR payload keys; integers keep the blob compact
_K_SERIAL = 1
_K_JTI = 2
_K_EXP = 3


class ClaimError(Exception):
    """claim blob was malformed, mis-signed, or expired"""


@dataclass(frozen=True)
class FactoryClaim:
    serial_number: str
    jti: str
    expires_at: datetime


def _factory_pubkey() -> Ed25519PublicKey:
    pem = get_settings().factory_pubkey
    if not pem:
        raise ClaimError("FACTORY_PUBKEY not configured")
    try:
        key = serialization.load_pem_public_key(pem.encode())
    except (ValueError, TypeError) as err:
        raise ClaimError(f"FACTORY_PUBKEY not valid PEM: {err}") from err
    if not isinstance(key, Ed25519PublicKey):
        raise ClaimError("FACTORY_PUBKEY is not Ed25519")
    return key


def verify_claim(token: str) -> FactoryClaim:
    """Decode base45 -> COSE_Sign1 -> verify Ed25519.

    Raises ClaimError on any failure: bad encoding, bad signature, expired,
    missing field. Caller resolves serial -> FactoryDevice for uuid/oob.
    """
    try:
        cose_blob = base45.b45decode(token)
    except ValueError as err:
        raise ClaimError(f"bad base45: {err}") from err

    try:
        payload_bytes = decode_and_verify_sign1(cose_blob, _factory_pubkey())
    except CoseError as err:
        raise ClaimError(str(err)) from err

    try:
        payload = cbor2.loads(payload_bytes)
    except cbor2.CBORDecodeError as err:
        raise ClaimError(f"bad CBOR payload: {err}") from err
    if not isinstance(payload, dict):
        raise ClaimError("payload not a map")

    serial = payload.get(_K_SERIAL)
    jti = payload.get(_K_JTI)
    exp = payload.get(_K_EXP)
    if not isinstance(serial, str) or not serial:
        raise ClaimError("serial missing or wrong type")
    if not isinstance(jti, bytes) or len(jti) != 16:
        raise ClaimError("jti must be 16 raw bytes")
    if not isinstance(exp, int):
        raise ClaimError("exp must be unix-int")

    expires_at = datetime.fromtimestamp(exp, tz=UTC)
    if expires_at <= datetime.now(UTC):
        raise ClaimError("claim expired")

    return FactoryClaim(
        serial_number=serial,
        jti=str(uuid.UUID(bytes=jti)),
        expires_at=expires_at,
    )

"""Verifies factory-signed claim JWTs from node QR codes"""

from dataclasses import dataclass
from datetime import datetime

import jwt

from app.config import get_settings

ALGORITHM = "EdDSA"
ISSUER = "factory"

# 16 bytes hex-encoded, matches BLE-mesh static OOB
OOB_HEX_LEN = 32


class ClaimError(Exception):
    """Claim JWT was malformed, unsigned, expired, or had bad fields"""


@dataclass(frozen=True)
class FactoryClaim:
    serial_number: str
    mesh_uuid: str
    oob_hex: str
    jti: str
    issued_at: datetime
    expires_at: datetime


def _factory_pubkey() -> str:
    pubkey = get_settings().factory_pubkey
    if not pubkey:
        raise ClaimError("FACTORY_PUBKEY not configured")
    return pubkey


def _is_hex(s: str, length: int) -> bool:
    if len(s) != length:
        return False
    try:
        int(s, 16)
    except ValueError:
        return False
    return True


def verify_claim_jwt(token: str) -> FactoryClaim:
    """Decode and verify a factory-signed claim JWT

    Raises ClaimError on any failure: bad signature, expired, missing claim,
    wrong issuer, wrong algorithm. Both uuid and oob are part of the signed
    payload, so clients cannot tamper with either without invalidating the
    signature.
    """
    try:
        payload = jwt.decode(
            token,
            _factory_pubkey(),
            algorithms=[ALGORITHM],
            issuer=ISSUER,
            options={"require": ["exp", "iat", "iss", "sub", "jti", "uuid", "oob"]},
        )
    except jwt.ExpiredSignatureError as err:
        raise ClaimError("claim expired") from err
    except jwt.MissingRequiredClaimError as err:
        raise ClaimError(f"claim missing required field: {err.claim}") from err
    except jwt.InvalidIssuerError as err:
        raise ClaimError("claim issuer is not 'factory'") from err
    except jwt.InvalidAlgorithmError as err:
        raise ClaimError("claim signed with unsupported algorithm") from err
    except jwt.PyJWTError as err:
        raise ClaimError(f"claim invalid: {err}") from err

    mesh_uuid = payload.get("uuid")
    if not isinstance(mesh_uuid, str) or not mesh_uuid:
        raise ClaimError("claim 'uuid' must be a non-empty string")

    oob_hex = payload.get("oob")
    if not isinstance(oob_hex, str) or not _is_hex(oob_hex, OOB_HEX_LEN):
        raise ClaimError(f"claim 'oob' must be {OOB_HEX_LEN} hex chars")

    return FactoryClaim(
        serial_number=payload["sub"],
        mesh_uuid=mesh_uuid,
        oob_hex=oob_hex,
        jti=payload["jti"],
        issued_at=datetime.fromtimestamp(payload["iat"]),
        expires_at=datetime.fromtimestamp(payload["exp"]),
    )

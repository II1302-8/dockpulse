"""Verifies factory-signed claim JWTs from node QR codes.

The factory signs a claim JWT per node with an Ed25519 private key. The
backend holds the matching public key (PEM) in the FACTORY_PUBKEY env var
and verifies signature, expiry, and that the required claims are present.
"""

import os
from dataclasses import dataclass
from datetime import datetime

import jwt

ALGORITHM = "EdDSA"
ISSUER = "factory"


class ClaimError(Exception):
    """Claim JWT was malformed, unsigned, expired, or had bad fields."""


@dataclass(frozen=True)
class FactoryClaim:
    serial_number: str
    mesh_uuid: str
    jti: str
    issued_at: datetime
    expires_at: datetime


def _factory_pubkey() -> str:
    pubkey = os.environ.get("FACTORY_PUBKEY")
    if not pubkey:
        raise ClaimError("FACTORY_PUBKEY not configured")
    return pubkey


def verify_claim_jwt(token: str) -> FactoryClaim:
    """Decode and verify a factory-signed claim JWT.

    Raises ClaimError on any failure: bad signature, expired, missing claim,
    wrong issuer, wrong algorithm.
    """
    try:
        payload = jwt.decode(
            token,
            _factory_pubkey(),
            algorithms=[ALGORITHM],
            issuer=ISSUER,
            options={"require": ["exp", "iat", "iss", "sub", "jti"]},
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
        raise ClaimError("claim missing 'uuid' field")

    return FactoryClaim(
        serial_number=payload["sub"],
        mesh_uuid=mesh_uuid,
        jti=payload["jti"],
        issued_at=datetime.fromtimestamp(payload["iat"]),
        expires_at=datetime.fromtimestamp(payload["exp"]),
    )

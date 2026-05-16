"""parses the QR sticker payload into a name+nonce lookup token.

QR is `<serial>:<jti>` plaintext. The mesh-side OOB is the real auth
(PB-ADV proves device knows the OOB), so the sticker only needs to be
unforgeable enough to look up the FactoryDevice row. CF Access on
admin /factory-devices is the trust boundary for who can register a
device; the sticker is a name + replay-protection token, not a signed
credential.
"""

from dataclasses import dataclass


class ClaimError(Exception):
    """sticker payload was malformed or otherwise unparseable"""


@dataclass(frozen=True)
class FactoryClaim:
    serial_number: str
    jti: str


# guardrails so a pasted blob can't blow up downstream parsers
_MAX_SERIAL = 64
_MAX_JTI = 64


def verify_claim(token: str) -> FactoryClaim:
    if not isinstance(token, str) or not token:
        raise ClaimError("empty sticker payload")
    parts = token.strip().split(":", 1)
    if len(parts) != 2:
        raise ClaimError("expected serial:jti format")
    serial, jti = parts[0], parts[1]
    if not serial or len(serial) > _MAX_SERIAL:
        raise ClaimError("serial missing or too long")
    if not jti or len(jti) > _MAX_JTI:
        raise ClaimError("jti missing or too long")
    return FactoryClaim(serial_number=serial, jti=jti)

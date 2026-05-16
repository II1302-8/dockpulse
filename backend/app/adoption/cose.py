"""minimal COSE_Sign1 over Ed25519 (RFC 9052), only the bits we need.

we avoided pycose because it expects cbor2<5 (list arrays), and we don't
need the full COSE algorithm matrix. wire format is bit-compatible.
"""

import cbor2
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

# COSE tag for Sign1
_TAG_SIGN1 = 18
# COSE header label
_HDR_ALG = 1
# COSE algorithm registry: EdDSA = -8
_ALG_EDDSA = -8


class CoseError(Exception):
    """sign1 blob couldn't be decoded, header was wrong, or signature failed"""


def _sig_structure(protected: bytes, payload: bytes) -> bytes:
    # Sig_structure1: ["Signature1", body_protected, external_aad, payload]
    return cbor2.dumps(["Signature1", protected, b"", payload])


def encode_sign1(payload: bytes, priv: Ed25519PrivateKey) -> bytes:
    """Build a tagged COSE_Sign1 over `payload` with `alg=EdDSA`."""
    protected = cbor2.dumps({_HDR_ALG: _ALG_EDDSA})
    sig = priv.sign(_sig_structure(protected, payload))
    return cbor2.dumps(cbor2.CBORTag(_TAG_SIGN1, [protected, {}, payload, sig]))


def decode_and_verify_sign1(blob: bytes, pub: Ed25519PublicKey) -> bytes:
    """Verify the signature and return the inner payload bytes."""
    try:
        tagged = cbor2.loads(blob)
    except cbor2.CBORDecodeError as err:
        raise CoseError(f"not CBOR: {err}") from err
    if not isinstance(tagged, cbor2.CBORTag) or tagged.tag != _TAG_SIGN1:
        raise CoseError("not a COSE_Sign1-tagged value")
    if not isinstance(tagged.value, (list, tuple)) or len(tagged.value) != 4:
        raise CoseError("Sign1 array must have 4 elements")
    protected, _unprotected, payload, signature = tagged.value
    if not isinstance(protected, bytes) or not isinstance(payload, bytes):
        raise CoseError("protected and payload must be bytes")
    if not isinstance(signature, bytes):
        raise CoseError("signature must be bytes")
    try:
        phdr = cbor2.loads(protected) if protected else {}
    except cbor2.CBORDecodeError as err:
        raise CoseError(f"bad protected header: {err}") from err
    if not isinstance(phdr, dict) or phdr.get(_HDR_ALG) != _ALG_EDDSA:
        raise CoseError("alg must be EdDSA")
    try:
        pub.verify(signature, _sig_structure(protected, payload))
    except InvalidSignature as err:
        raise CoseError("signature invalid") from err
    return payload

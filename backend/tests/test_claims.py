import pytest

from app.adoption.claims import ClaimError, verify_claim
from tests._helpers import DEFAULT_JTI, DEFAULT_SERIAL, make_qr_payload


def test_verify_parses_serial_and_jti():
    qr = make_qr_payload()
    claim = verify_claim(qr)
    assert claim.serial_number == DEFAULT_SERIAL
    assert claim.jti == DEFAULT_JTI


def test_verify_rejects_empty():
    with pytest.raises(ClaimError):
        verify_claim("")


@pytest.mark.parametrize(
    "bad",
    [
        pytest.param("noseparator", id="no_separator"),
        pytest.param(":only-jti", id="empty_serial"),
        pytest.param("only-serial:", id="empty_jti"),
        pytest.param(":", id="both_empty"),
    ],
)
def test_verify_rejects_malformed(bad: str):
    with pytest.raises(ClaimError):
        verify_claim(bad)


def test_verify_strips_whitespace():
    claim = verify_claim(f"  {DEFAULT_SERIAL}:{DEFAULT_JTI}  ")
    assert claim.serial_number == DEFAULT_SERIAL
    assert claim.jti == DEFAULT_JTI


def test_verify_caps_serial_length():
    with pytest.raises(ClaimError):
        verify_claim(("X" * 65) + ":" + DEFAULT_JTI)


def test_verify_caps_jti_length():
    with pytest.raises(ClaimError):
        verify_claim(DEFAULT_SERIAL + ":" + ("X" * 65))

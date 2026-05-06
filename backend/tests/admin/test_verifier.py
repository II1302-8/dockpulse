"""cf access jwt verifier, accept + reject paths"""

import time

import pytest

from app import cf_access


def test_verify_accepts_valid_assertion(mint):
    identity = cf_access.verify_assertion(mint())
    assert identity.email == "ops@dockpulse.xyz"
    assert identity.sub == "user-abc"


def test_verify_rejects_expired(mint):
    token = mint(exp=int(time.time()) - 60)
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_rejects_wrong_aud(mint):
    token = mint(aud="some-other-app")
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_rejects_wrong_issuer(mint):
    token = mint(iss="https://attacker.cloudflareaccess.com")
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_rejects_missing_email(mint):
    token = mint(email=None)
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_errors_when_unconfigured(monkeypatch):
    monkeypatch.delenv("CF_ACCESS_TEAM_DOMAIN", raising=False)
    monkeypatch.delenv("CF_ACCESS_AUD", raising=False)
    from app.config import get_settings

    get_settings.cache_clear()
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion("any.jwt.here")

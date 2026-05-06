"""Tests for the Cloudflare Access JWT verifier + admin auth gate.

JWKS is mocked locally so the test never touches the network — we generate
an RSA keypair, build a JWKS document around the public key, sign tokens
with the private key, and patch PyJWKClient.fetch_data to return our JWKS.
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import AsyncClient
from jwt import PyJWKClient
from jwt.utils import to_base64url_uint

from app import cf_access

TEAM = "https://dockpulse.cloudflareaccess.com"
AUD = "test-aud-tag"
KID = "test-kid"


@pytest.fixture
def cf_keys(monkeypatch):
    """Generate RSA keypair, point cf_access at a fake JWKS for it."""
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pub = priv.public_key()
    nums = pub.public_numbers()
    jwk = {
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": KID,
        "n": to_base64url_uint(nums.n).decode(),
        "e": to_base64url_uint(nums.e).decode(),
    }
    jwks = {"keys": [jwk]}

    monkeypatch.setattr(PyJWKClient, "fetch_data", lambda self: jwks)
    # clear the module-level cache so test ordering doesn't matter
    cf_access._jwks_clients.clear()

    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", TEAM)
    monkeypatch.setenv("CF_ACCESS_AUD", AUD)
    # settings is lru_cache'd; tests already clear it via the get_settings fixture
    from app.config import get_settings

    get_settings.cache_clear()

    return priv


def _mint(priv, **overrides) -> str:
    now = int(time.time())
    payload = {
        "iss": TEAM,
        "aud": AUD,
        "sub": "user-abc",
        "email": "ops@dockpulse.xyz",
        "iat": now,
        "exp": now + 300,
        **overrides,
    }
    return jwt.encode(
        payload,
        priv,
        algorithm="RS256",
        headers={"kid": KID},
    )


def test_verify_accepts_valid_assertion(cf_keys):
    token = _mint(cf_keys)
    identity = cf_access.verify_assertion(token)
    assert identity.email == "ops@dockpulse.xyz"
    assert identity.sub == "user-abc"


def test_verify_rejects_expired(cf_keys):
    token = _mint(cf_keys, exp=int(time.time()) - 60)
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_rejects_wrong_aud(cf_keys):
    token = _mint(cf_keys, aud="some-other-app")
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_rejects_wrong_issuer(cf_keys):
    token = _mint(cf_keys, iss="https://attacker.cloudflareaccess.com")
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_rejects_missing_email(cf_keys):
    token = _mint(cf_keys, email=None)
    # PyJWT serialises None as null which still satisfies require=email,
    # so handler falls through to the explicit isinstance check
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion(token)


def test_verify_errors_when_unconfigured(monkeypatch):
    monkeypatch.delenv("CF_ACCESS_TEAM_DOMAIN", raising=False)
    monkeypatch.delenv("CF_ACCESS_AUD", raising=False)
    from app.config import get_settings

    get_settings.cache_clear()
    with pytest.raises(cf_access.AccessAuthError):
        cf_access.verify_assertion("any.jwt.here")


# ---- admin router auth gate ----


async def test_admin_snapshot_rejects_missing_header(client: AsyncClient, cf_keys):
    r = await client.get("/api/admin/snapshot")
    assert r.status_code == 401
    assert "Cf-Access-Jwt-Assertion" in r.json()["detail"]


async def test_admin_snapshot_rejects_invalid_token(client: AsyncClient, cf_keys):
    r = await client.get(
        "/api/admin/snapshot",
        headers={"Cf-Access-Jwt-Assertion": "not.a.valid.jwt"},
    )
    assert r.status_code == 401


async def test_admin_snapshot_returns_state(client: AsyncClient, cf_keys, harbor_world):
    token = _mint(cf_keys)
    r = await client.get(
        "/api/admin/snapshot",
        headers={"Cf-Access-Jwt-Assertion": token},
    )
    assert r.status_code == 200
    body = r.json()
    assert "gateways" in body
    assert "nodes" in body
    assert "pending_gateways" in body
    assert body["adoption"]["pending"] == 0


# ---- gateway endpoints ----


async def test_admin_create_gateway(
    client: AsyncClient, cf_keys, harbor_world, session
):
    # harbor_world seeds gw1 on d1; need a fresh dock for the new gateway
    from app.models import Dock

    session.add(Dock(dock_id="d2", harbor_id="h1", name="Dock 2"))
    await session.commit()

    token = _mint(cf_keys)
    r = await client.post(
        "/api/admin/gateways",
        headers={"Cf-Access-Jwt-Assertion": token},
        json={"gateway_id": "gw-new", "dock_id": "d2", "name": "New Gateway"},
    )
    assert r.status_code == 201
    assert r.json()["gateway_id"] == "gw-new"


async def test_admin_create_gateway_rejects_unknown_dock(
    client: AsyncClient, cf_keys, harbor_world
):
    token = _mint(cf_keys)
    r = await client.post(
        "/api/admin/gateways",
        headers={"Cf-Access-Jwt-Assertion": token},
        json={"gateway_id": "gw-x", "dock_id": "missing", "name": "X"},
    )
    assert r.status_code == 404


async def test_admin_patch_gateway_ttl(
    client: AsyncClient, cf_keys, harbor_world, session
):
    # patch the existing gw1 from harbor_world (no new gateway needed)
    token = _mint(cf_keys)
    r = await client.patch(
        "/api/admin/gateways/gw1",
        headers={"Cf-Access-Jwt-Assertion": token},
        json={"provision_ttl_s": 300},
    )
    assert r.status_code == 200
    assert r.json()["provision_ttl_s"] == 300


async def test_admin_dismiss_pending_gateway(
    client: AsyncClient, cf_keys, harbor_world, session
):
    from app.models import PendingGateway

    session.add(PendingGateway(gateway_id="gw-dismiss", attempts=2))
    await session.commit()
    token = _mint(cf_keys)

    r = await client.delete(
        "/api/admin/gateways/pending/gw-dismiss",
        headers={"Cf-Access-Jwt-Assertion": token},
    )
    assert r.status_code == 204


# ---- node decommission ----


async def test_admin_decommission_unknown_node_returns_404(
    client: AsyncClient, cf_keys, harbor_world
):
    token = _mint(cf_keys)
    r = await client.post(
        "/api/admin/nodes/no-such-node/decommission",
        headers={"Cf-Access-Jwt-Assertion": token},
    )
    assert r.status_code == 404


# ---- adoption admin ----


async def test_admin_bulk_delete_adoptions(
    client: AsyncClient, cf_keys, harbor_world, harbor_master, session
):
    from datetime import UTC, datetime, timedelta

    from app.models import AdoptionRequest

    now = datetime.now(UTC)
    session.add_all(
        [
            AdoptionRequest(
                request_id="r-err",
                mesh_uuid="aa" * 16,
                serial_number="sn-err",
                claim_jti="jti-err",
                gateway_id="gw1",
                berth_id="b1",
                expires_at=now + timedelta(seconds=300),
                status="err",
                error_code="cfg-fail",
                created_by_user_id="hm1",
                created_at=now,
                completed_at=now,
            ),
            AdoptionRequest(
                request_id="r-pending",
                mesh_uuid="bb" * 16,
                serial_number="sn-pending",
                claim_jti="jti-pending",
                gateway_id="gw1",
                berth_id="b1",
                expires_at=now + timedelta(seconds=300),
                status="pending",
                created_by_user_id="hm1",
                created_at=now,
            ),
        ]
    )
    await session.commit()
    token = _mint(cf_keys)

    r = await client.delete(
        "/api/admin/adoptions",
        headers={"Cf-Access-Jwt-Assertion": token},
        params={"status": "err"},
    )
    assert r.status_code == 200
    assert r.json() == {"deleted": 1, "status_filter": "err"}

    # pending row untouched
    assert await session.get(AdoptionRequest, "r-pending") is not None
    assert await session.get(AdoptionRequest, "r-err") is None


async def test_admin_bulk_delete_rejects_bad_status(
    client: AsyncClient, cf_keys, harbor_world
):
    token = _mint(cf_keys)
    r = await client.delete(
        "/api/admin/adoptions",
        headers={"Cf-Access-Jwt-Assertion": token},
        params={"status": "garbage"},
    )
    assert r.status_code == 400


async def test_admin_run_sweeper(client: AsyncClient, cf_keys, harbor_world):
    token = _mint(cf_keys)
    r = await client.post(
        "/api/admin/sweeper/run",
        headers={"Cf-Access-Jwt-Assertion": token},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["expired"] == 0
    assert body["pruned"] == 0

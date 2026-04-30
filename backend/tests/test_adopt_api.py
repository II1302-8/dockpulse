import base64
import json
import os
import time

import jwt
import pytest
import pytest_asyncio
from argon2 import PasswordHasher
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adoption.claims import ALGORITHM
from app.models import AdoptionRequest, Dock, Gateway, Harbor, Node, User

SECRET_KEY = os.environ.get("SECRET_KEY", "test-secret")
JWT_ALGORITHM = "HS256"
_ph = PasswordHasher()


def _auth_token(user_id: str, token_version: int = 0) -> str:
    return jwt.encode(
        {"sub": user_id, "ver": token_version}, SECRET_KEY, algorithm=JWT_ALGORITHM
    )


def _hash(password: str) -> str:
    return _ph.hash(password)


def _make_factory_keys() -> tuple[str, str]:
    priv = Ed25519PrivateKey.generate()
    priv_pem = priv.private_bytes(
        Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
    ).decode()
    pub_pem = (
        priv.public_key()
        .public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )
    return priv_pem, pub_pem


def _make_qr_payload(priv_pem: str, **claim_overrides) -> str:
    now = int(time.time())
    claim = {
        "iss": "factory",
        "sub": "DP-N-000123",
        "uuid": "0123456789abcdef0123456789abcdef",
        "jti": "claim-jti-1",
        "iat": now,
        "exp": now + 3600,
    }
    claim.update(claim_overrides)
    token = jwt.encode(claim, priv_pem, algorithm=ALGORITHM)
    qr = {
        "v": 1,
        "uuid": claim["uuid"],
        "oob": "00112233445566778899aabbccddeeff",
        "sn": claim["sub"],
        "jwt": token,
    }
    raw = json.dumps(qr).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@pytest.fixture
def factory_pubkey(monkeypatch):
    priv_pem, pub_pem = _make_factory_keys()
    monkeypatch.setenv("FACTORY_PUBKEY", pub_pem)
    return priv_pem


@pytest_asyncio.fixture
async def harbor_master(session: AsyncSession) -> User:
    user = User(
        user_id="hm1",
        firstname="Hilda",
        lastname="Master",
        email="hilda@example.com",
        password_hash=_hash("secret"),
        role="harbormaster",
    )
    session.add(user)
    await session.commit()
    return user


@pytest_asyncio.fixture
async def boat_owner(session: AsyncSession) -> User:
    user = User(
        user_id="o1",
        firstname="Olle",
        lastname="Owner",
        email="olle@example.com",
        password_hash=_hash("secret"),
        role="boat_owner",
    )
    session.add(user)
    await session.commit()
    return user


@pytest_asyncio.fixture
async def harbor_with_gateway(session: AsyncSession):
    """Harbor h1 / dock d1 / berth b1 / gateway gw1"""
    session.add_all(
        [
            Harbor(harbor_id="h1", name="Test Harbor"),
            Dock(dock_id="d1", harbor_id="h1", name="Test Dock"),
        ]
    )
    await session.commit()
    from app.models import Berth

    session.add(Berth(berth_id="b1", dock_id="d1", status="free"))
    session.add(
        Gateway(gateway_id="gw1", dock_id="d1", name="Test Gateway", status="online")
    )
    await session.commit()


def _adopt_body(qr: str, **overrides) -> dict:
    body = {"qr_payload": qr, "berth_id": "b1", "gateway_id": "gw1"}
    body.update(overrides)
    return body


async def test_adopt_happy_path_creates_pending_request(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_with_gateway,
    factory_pubkey,
):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "pending"
    assert body["serial_number"] == "DP-N-000123"
    assert body["mesh_uuid"] == "0123456789abcdef0123456789abcdef"
    assert body["gateway_id"] == "gw1"
    assert body["berth_id"] == "b1"
    assert body["request_id"]

    stored = await session.get(AdoptionRequest, body["request_id"])
    assert stored is not None
    assert stored.status == "pending"
    assert stored.claim_jti == "claim-jti-1"


async def test_adopt_requires_auth(
    client: AsyncClient, harbor_with_gateway, factory_pubkey
):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post("/api/nodes/adopt", json=_adopt_body(qr))
    assert r.status_code == 401


async def test_adopt_rejects_boat_owner(
    client: AsyncClient,
    boat_owner: User,
    harbor_with_gateway,
    factory_pubkey,
):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(boat_owner.user_id)}"},
    )
    assert r.status_code == 403


async def test_adopt_rejects_invalid_qr_encoding(
    client: AsyncClient, harbor_master: User, harbor_with_gateway, factory_pubkey
):
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body("!!! not base64 !!!"),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 400


async def test_adopt_rejects_qr_without_jwt(
    client: AsyncClient, harbor_master: User, harbor_with_gateway, factory_pubkey
):
    raw = json.dumps({"v": 1, "sn": "X"}).encode()
    qr = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 400


async def test_adopt_rejects_bad_signature(
    client: AsyncClient, harbor_master: User, harbor_with_gateway, factory_pubkey
):
    other_priv, _ = _make_factory_keys()
    qr = _make_qr_payload(other_priv)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 400


async def test_adopt_returns_404_for_unknown_gateway(
    client: AsyncClient, harbor_master: User, harbor_with_gateway, factory_pubkey
):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr, gateway_id="nope"),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 404


async def test_adopt_returns_404_for_unknown_berth(
    client: AsyncClient, harbor_master: User, harbor_with_gateway, factory_pubkey
):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr, berth_id="nope"),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 404


async def test_adopt_rejects_gateway_dock_mismatch(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_with_gateway,
    factory_pubkey,
):
    from app.models import Berth

    session.add(Dock(dock_id="d2", harbor_id="h1", name="Other Dock"))
    await session.commit()
    session.add(Berth(berth_id="b2", dock_id="d2", status="free"))
    await session.commit()

    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr, berth_id="b2"),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 400


async def test_adopt_rejects_berth_with_active_node(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_with_gateway,
    factory_pubkey,
):
    from datetime import UTC, datetime

    session.add(
        Node(
            node_id="n1",
            mesh_uuid="aaaa" * 8,
            serial_number="DP-EXISTING",
            berth_id="b1",
            gateway_id="gw1",
            mesh_unicast_addr="0x0007",
            dev_key_fp="sha256:abc",
            status="provisioned",
            adopted_at=datetime.now(UTC),
            adopted_by_user_id=harbor_master.user_id,
        )
    )
    await session.commit()

    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 409


async def test_adopt_rejects_reused_jti(
    client: AsyncClient, harbor_master: User, harbor_with_gateway, factory_pubkey
):
    qr = _make_qr_payload(factory_pubkey, jti="reused-jti")
    headers = {"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"}

    first = await client.post("/api/nodes/adopt", json=_adopt_body(qr), headers=headers)
    assert first.status_code == 202

    second = await client.post(
        "/api/nodes/adopt", json=_adopt_body(qr), headers=headers
    )
    assert second.status_code == 409


async def test_adopt_persists_creator(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_with_gateway,
    factory_pubkey,
):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 202

    result = await session.execute(
        select(AdoptionRequest).where(AdoptionRequest.claim_jti == "claim-jti-1")
    )
    request = result.scalar_one()
    assert request.created_by_user_id == harbor_master.user_id


async def test_adopt_publishes_provision_req(
    client: AsyncClient,
    harbor_master: User,
    harbor_with_gateway,
    factory_pubkey,
    monkeypatch,
):
    captured: list[dict] = []

    async def fake_publish(**kwargs):
        captured.append(kwargs)

    monkeypatch.setattr("app.routers.nodes.publish_provision_req", fake_publish)

    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 202
    assert len(captured) == 1
    call = captured[0]
    assert call["gateway_id"] == "gw1"
    assert call["mesh_uuid"] == "0123456789abcdef0123456789abcdef"
    assert call["oob"] == "00112233445566778899aabbccddeeff"
    assert call["ttl_s"] == 60
    assert call["request_id"] == r.json()["request_id"]

import base64
import json
import time

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adoption.claims import ALGORITHM
from app.models import AdoptionRequest, Dock, Gateway, Node, User
from tests._helpers import (
    make_auth_token as _auth_token,
)
from tests._helpers import (
    make_factory_keys,
)
from tests._helpers import (
    make_qr_payload as _make_qr_payload,
)


def _adopt_body(qr: str, **overrides) -> dict:
    body = {"qr_payload": qr, "berth_id": "b1", "gateway_id": "gw1"}
    body.update(overrides)
    return body


async def test_adopt_happy_path_creates_pending_request(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
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


async def test_adopt_requires_auth(client: AsyncClient, harbor_world, factory_pubkey):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post("/api/nodes/adopt", json=_adopt_body(qr))
    assert r.status_code == 401


async def test_adopt_rejects_boat_owner(
    client: AsyncClient,
    boat_owner: User,
    harbor_world,
    factory_pubkey,
):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(boat_owner.user_id)}"},
    )
    assert r.status_code == 403


def _signed_claim(priv: str, **overrides) -> tuple[dict, str]:
    now = int(time.time())
    claim = {
        "iss": "factory",
        "sub": "DP-N-000123",
        "uuid": "0123456789abcdef0123456789abcdef",
        "jti": "claim-jti-malformed",
        "iat": now,
        "exp": now + 3600,
    }
    claim.update(overrides)
    return claim, jwt.encode(claim, priv, algorithm=ALGORITHM)


def _b64(qr_dict: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(qr_dict).encode()).rstrip(b"=").decode()


def _qr_invalid_encoding(_priv: str) -> str:
    return "!!! not base64 !!!"


def _qr_without_oob(priv: str) -> str:
    claim, token = _signed_claim(priv)
    return _b64({"v": 1, "uuid": claim["uuid"], "sn": claim["sub"], "jwt": token})


def _qr_empty_oob(priv: str) -> str:
    claim, token = _signed_claim(priv)
    return _b64(
        {"v": 1, "uuid": claim["uuid"], "oob": "", "sn": claim["sub"], "jwt": token}
    )


def _qr_without_jwt(_priv: str) -> str:
    return _b64({"v": 1, "sn": "X"})


def _qr_bad_signature(_priv: str) -> str:
    other_priv, _ = make_factory_keys()
    return _make_qr_payload(other_priv)


@pytest.mark.parametrize(
    "qr_factory",
    [
        pytest.param(_qr_invalid_encoding, id="invalid_encoding"),
        pytest.param(_qr_without_oob, id="without_oob"),
        pytest.param(_qr_empty_oob, id="empty_oob"),
        pytest.param(_qr_without_jwt, id="without_jwt"),
        pytest.param(_qr_bad_signature, id="bad_signature"),
    ],
)
async def test_adopt_rejects_malformed_qr(
    qr_factory,
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    factory_pubkey,
):
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr_factory(factory_pubkey)),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 400
    rows = (await session.execute(select(AdoptionRequest))).scalars().all()
    assert rows == []


async def test_adopt_returns_404_for_unknown_gateway(
    client: AsyncClient, harbor_master: User, harbor_world, factory_pubkey
):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr, gateway_id="nope"),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 404


async def test_adopt_returns_404_for_unknown_berth(
    client: AsyncClient, harbor_master: User, harbor_world, factory_pubkey
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
    harbor_world,
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
    harbor_world,
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
    client: AsyncClient, harbor_master: User, harbor_world, factory_pubkey
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
    harbor_world,
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


async def test_adopt_rejects_offline_gateway(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    factory_pubkey,
):
    gateway = await session.get(Gateway, "gw1")
    gateway.status = "offline"
    await session.commit()

    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 409


async def test_get_adoption_returns_request(
    client: AsyncClient,
    harbor_master: User,
    harbor_world,
    factory_pubkey,
):
    qr = _make_qr_payload(factory_pubkey)
    create = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert create.status_code == 202
    request_id = create.json()["request_id"]

    r = await client.get(
        f"/api/adoptions/{request_id}",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 200
    assert r.json()["request_id"] == request_id
    assert r.json()["status"] == "pending"


async def test_get_adoption_404_unknown(
    client: AsyncClient, harbor_master: User, harbor_world
):
    r = await client.get(
        "/api/adoptions/missing",
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 404


async def test_get_adoption_requires_harbormaster(
    client: AsyncClient, boat_owner: User, harbor_world
):
    r = await client.get(
        "/api/adoptions/anything",
        headers={"Authorization": f"Bearer {_auth_token(boat_owner.user_id)}"},
    )
    assert r.status_code == 403


async def test_get_adoption_requires_auth(client: AsyncClient):
    r = await client.get("/api/adoptions/anything")
    assert r.status_code == 401


async def test_adopt_publishes_provision_req(
    client: AsyncClient,
    harbor_master: User,
    harbor_world,
    factory_pubkey,
    published_provision_reqs: list[dict],
):
    qr = _make_qr_payload(factory_pubkey)
    r = await client.post(
        "/api/nodes/adopt",
        json=_adopt_body(qr),
        headers={"Authorization": f"Bearer {_auth_token(harbor_master.user_id)}"},
    )
    assert r.status_code == 202
    assert len(published_provision_reqs) == 1
    call = published_provision_reqs[0]
    assert call["gateway_id"] == "gw1"
    assert call["mesh_uuid"] == "0123456789abcdef0123456789abcdef"
    assert call["oob"] == "00112233445566778899aabbccddeeff"
    assert call["ttl_s"] == 60
    assert call["request_id"] == r.json()["request_id"]

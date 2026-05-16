import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdoptionRequest, Berth, Dock, Gateway, Harbor, Node, User
from tests._helpers import (
    DEFAULT_JTI,
    DEFAULT_OOB,
    DEFAULT_SERIAL,
    DEFAULT_UUID,
    make_factory_keys,
    make_qr_payload,
    seed_factory_device,
)
from tests._helpers import (
    auth_cookies as _creds,
)


def _adopt_body(qr: str, **overrides) -> dict:
    body = {"qr_payload": qr, "berth_id": "b1", "gateway_id": "gw1"}
    body.update(overrides)
    return body


def _new_jti() -> str:
    return str(uuid.uuid4())


async def test_adopt_happy_path_creates_pending_request(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "pending"
    assert body["serial_number"] == DEFAULT_SERIAL
    assert body["mesh_uuid"] == DEFAULT_UUID
    assert body["gateway_id"] == "gw1"
    assert body["berth_id"] == "b1"
    assert body["request_id"]

    stored = await session.get(AdoptionRequest, body["request_id"])
    assert stored is not None
    assert stored.status == "pending"
    assert stored.claim_jti == DEFAULT_JTI


async def test_adopt_requires_auth(client: AsyncClient, harbor_world, adopt_qr):
    qr = await adopt_qr()
    r = await client.post("/api/adoptions", json=_adopt_body(qr))
    assert r.status_code == 401


async def test_adopt_rejects_boat_owner(
    client: AsyncClient,
    boat_owner: User,
    harbor_world,
    adopt_qr,
):
    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(boat_owner.user_id),
    )
    assert r.status_code == 403


def _qr_invalid_base45(_priv: str) -> str:
    # contains '!' which is outside the base45 alphabet
    return "!!! not base45 !!!"


def _qr_bad_signature(_priv: str) -> str:
    # signed by a different key than the one the backend trusts
    other_priv, _ = make_factory_keys()
    return make_qr_payload(other_priv)


def _qr_expired(priv: str) -> str:
    return make_qr_payload(priv, exp_offset_s=-60)


@pytest.mark.parametrize(
    "qr_factory",
    [
        pytest.param(_qr_invalid_base45, id="invalid_base45"),
        pytest.param(_qr_bad_signature, id="bad_signature"),
        pytest.param(_qr_expired, id="expired"),
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
    # seed the canonical FactoryDevice so the failure can only come from
    # the QR itself, not a missing serial lookup
    await seed_factory_device(session)
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr_factory(factory_pubkey)),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 400
    rows = (await session.execute(select(AdoptionRequest))).scalars().all()
    assert rows == []


async def test_adopt_rejects_unknown_serial(
    client: AsyncClient,
    harbor_master: User,
    harbor_world,
    factory_pubkey,
):
    # serial signed in the QR but FactoryDevice never registered (factory-flash
    # POST didn't reach the backend)
    qr = make_qr_payload(factory_pubkey, serial="DP-N-UNREGISTERED")
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 400


async def test_adopt_rejects_jti_mismatch(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    factory_pubkey,
):
    # FactoryDevice has one jti; the QR was signed with a different one
    # (e.g. an old sticker after a re-roll)
    await seed_factory_device(session, jti=DEFAULT_JTI)
    qr = make_qr_payload(factory_pubkey, jti=_new_jti())
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 400


async def test_adopt_rejects_oversize_qr_payload(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    """Pydantic max_length caps the payload before our handler runs.
    FastAPI surfaces validation errors as 422."""
    huge = (await adopt_qr()) + ("A" * 5000)
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(huge),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 422
    rows = (await session.execute(select(AdoptionRequest))).scalars().all()
    assert rows == []


async def test_adopt_returns_404_for_unknown_gateway(
    client: AsyncClient, harbor_master: User, harbor_world, adopt_qr
):
    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr, gateway_id="nope"),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 404


async def test_adopt_returns_404_for_unknown_berth(
    client: AsyncClient, harbor_master: User, harbor_world, adopt_qr
):
    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr, berth_id="nope"),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 404


async def test_adopt_rejects_gateway_dock_mismatch(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    session.add(Dock(dock_id="d2", harbor_id="h1", name="Other Dock"))
    await session.commit()
    session.add(Berth(berth_id="b2", dock_id="d2", status="free"))
    await session.commit()

    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr, berth_id="b2"),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 400


async def test_adopt_rejects_berth_with_active_node(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
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

    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 409


async def test_adopt_idempotent_while_pending(
    client: AsyncClient, harbor_master: User, harbor_world, adopt_qr
):
    """Reposting same claim while pending returns the existing row, not 409.
    Lets retries on flaky networks land cleanly without tripping the unique."""
    jti = _new_jti()
    qr = await adopt_qr(jti=jti)
    creds = _creds(harbor_master.user_id)

    first = await client.post("/api/adoptions", json=_adopt_body(qr), cookies=creds)
    assert first.status_code == 202

    second = await client.post("/api/adoptions", json=_adopt_body(qr), cookies=creds)
    assert second.status_code == 200
    assert second.json()["request_id"] == first.json()["request_id"]


async def test_adopt_recycles_err_row_on_retry(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
    published_provision_reqs,
):
    """Re-pasting the same QR after a failed adoption recycles the err row
    and re-fires provisioning. The QR sticker is single-use so the user
    has no other path to retry."""
    jti = _new_jti()
    qr = await adopt_qr(jti=jti)
    creds = _creds(harbor_master.user_id)

    first = await client.post("/api/adoptions", json=_adopt_body(qr), cookies=creds)
    assert first.status_code == 202
    request_id = first.json()["request_id"]
    assert len(published_provision_reqs) == 1

    row = await session.get(AdoptionRequest, request_id)
    row.status = "err"
    row.error_code = "cfg-fail"
    row.error_msg = "previous attempt"
    await session.commit()

    second = await client.post("/api/adoptions", json=_adopt_body(qr), cookies=creds)
    assert second.status_code == 200
    assert second.json()["request_id"] == request_id
    assert second.json()["status"] == "pending"
    assert second.json()["error_code"] is None
    assert second.json()["error_msg"] is None
    # gateway must receive a fresh provision/req on retry
    assert len(published_provision_reqs) == 2
    assert published_provision_reqs[1]["request_id"] == request_id


async def test_adopt_rejects_reused_jti_when_already_ok(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    """Successful adoptions are terminal; reposting same claim is a real bug."""
    jti = _new_jti()
    qr = await adopt_qr(jti=jti)
    creds = _creds(harbor_master.user_id)

    first = await client.post("/api/adoptions", json=_adopt_body(qr), cookies=creds)
    assert first.status_code == 202
    request_id = first.json()["request_id"]

    row = await session.get(AdoptionRequest, request_id)
    row.status = "ok"
    await session.commit()

    second = await client.post("/api/adoptions", json=_adopt_body(qr), cookies=creds)
    assert second.status_code == 409


async def test_adopt_persists_creator(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 202

    result = await session.execute(
        select(AdoptionRequest).where(AdoptionRequest.claim_jti == DEFAULT_JTI)
    )
    request = result.scalar_one()
    assert request.created_by_user_id == harbor_master.user_id


async def test_adopt_rejects_offline_gateway(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    gateway = await session.get(Gateway, "gw1")
    gateway.status = "offline"
    await session.commit()

    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 409


async def test_get_adoption_returns_request(
    client: AsyncClient,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    qr = await adopt_qr()
    create = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    assert create.status_code == 202
    request_id = create.json()["request_id"]

    r = await client.get(
        f"/api/adoptions/{request_id}",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    assert r.json()["request_id"] == request_id
    assert r.json()["status"] == "pending"


async def test_get_adoption_404_unknown(
    client: AsyncClient, harbor_master: User, harbor_world
):
    r = await client.get(
        "/api/adoptions/missing",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 404


async def test_get_adoption_requires_harbormaster(
    client: AsyncClient,
    session: AsyncSession,
    boat_owner: User,
    harbor_world,
):
    # seed a real request so resolver doesn't 404 before role check fires
    now = datetime.now(UTC)
    session.add(
        AdoptionRequest(
            request_id="req-x",
            mesh_uuid="dddd" * 8,
            serial_number="DP-N-X",
            claim_jti="x-jti",
            node_id="node-req-x",
            gateway_id="gw1",
            berth_id="b1",
            expires_at=now + timedelta(seconds=60),
            status="pending",
            created_by_user_id=boat_owner.user_id,
            created_at=now,
        )
    )
    await session.commit()
    r = await client.get(
        "/api/adoptions/req-x",
        cookies=_creds(boat_owner.user_id),
    )
    assert r.status_code == 403


async def test_get_adoption_requires_auth(client: AsyncClient):
    r = await client.get("/api/adoptions/anything")
    assert r.status_code == 401


async def test_adopt_rejects_foreign_harbor(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    session.add_all(
        [
            Harbor(harbor_id="h2", name="Other Harbor"),
            Dock(dock_id="d-foreign", harbor_id="h2", name="DF"),
        ]
    )
    await session.commit()
    session.add_all(
        [
            Berth(berth_id="b-foreign", dock_id="d-foreign", status="free"),
            Gateway(
                gateway_id="gw-foreign",
                dock_id="d-foreign",
                name="GF",
                status="online",
            ),
        ]
    )
    await session.commit()

    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr, berth_id="b-foreign", gateway_id="gw-foreign"),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Not authorized for this harbor"


async def test_adopt_publishes_provision_req(
    client: AsyncClient,
    harbor_master: User,
    harbor_world,
    adopt_qr,
    published_provision_reqs: list[dict],
):
    qr = await adopt_qr()
    r = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 202
    assert len(published_provision_reqs) == 1
    call = published_provision_reqs[0]
    assert call["gateway_id"] == "gw1"
    assert call["mesh_uuid"] == DEFAULT_UUID
    assert call["oob"] == DEFAULT_OOB
    assert call["ttl_s"] == 180
    assert call["berth_id"] == r.json()["berth_id"]
    assert call["request_id"] == r.json()["request_id"]


async def test_cancel_pending_request_marks_err_cancelled(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    qr = await adopt_qr()
    create = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    request_id = create.json()["request_id"]

    r = await client.post(
        f"/api/adoptions/{request_id}/cancel",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "err"
    assert body["error_code"] == "cancelled"

    stored = await session.get(AdoptionRequest, request_id)
    assert stored.status == "err"
    assert stored.error_code == "cancelled"
    assert stored.completed_at is not None


async def test_cancel_terminal_request_is_idempotent(
    client: AsyncClient,
    session: AsyncSession,
    harbor_master: User,
    harbor_world,
    adopt_qr,
):
    qr = await adopt_qr()
    create = await client.post(
        "/api/adoptions",
        json=_adopt_body(qr),
        cookies=_creds(harbor_master.user_id),
    )
    request_id = create.json()["request_id"]
    # mark terminal first via cancel
    await client.post(
        f"/api/adoptions/{request_id}/cancel",
        cookies=_creds(harbor_master.user_id),
    )
    # second cancel returns the row, doesn't error
    r = await client.post(
        f"/api/adoptions/{request_id}/cancel",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 200
    assert r.json()["error_code"] == "cancelled"


async def test_cancel_unknown_request_returns_404(
    client: AsyncClient, harbor_master: User, harbor_world
):
    r = await client.post(
        "/api/adoptions/does-not-exist/cancel",
        cookies=_creds(harbor_master.user_id),
    )
    assert r.status_code == 404

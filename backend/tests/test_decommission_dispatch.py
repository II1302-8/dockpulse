"""decommission/resp handler — direct dispatch, no broker"""

from datetime import UTC, datetime

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Node, User
from app.mqtt import _handle_decommission_resp


@pytest_asyncio.fixture
async def decommissioned_node(
    session: AsyncSession, harbor_world, harbor_master: User
) -> Node:
    now = datetime.now(UTC)
    node = Node(
        node_id="n-decom",
        mesh_uuid="bbbb" * 8,
        serial_number="DP-N-decom",
        berth_id="b1",
        gateway_id="gw1",
        mesh_unicast_addr="0x0042",
        dev_key_fp="fp",
        status="decommissioned",
        adopted_at=now,
        adopted_by_user_id=harbor_master.user_id,
    )
    session.add(node)
    await session.commit()
    return node


async def test_resp_ok_logs_no_db_change(
    session: AsyncSession, decommissioned_node: Node
):
    await _handle_decommission_resp(
        session,
        "gw1",
        {"req_id": "r1", "node_id": "n-decom", "status": "ok"},
    )
    await session.refresh(decommissioned_node)
    assert decommissioned_node.status == "decommissioned"


async def test_resp_err_reverts_status(
    session: AsyncSession, decommissioned_node: Node
):
    await _handle_decommission_resp(
        session,
        "gw1",
        {
            "req_id": "r1",
            "node_id": "n-decom",
            "status": "err",
            "code": "nvs-write",
            "msg": "esp_err=0x102",
        },
    )
    await session.refresh(decommissioned_node)
    assert decommissioned_node.status == "provisioned"


async def test_resp_err_without_node_id_does_not_revert(
    session: AsyncSession, decommissioned_node: Node
):
    # back-compat: old firmware doesn't echo node_id, must not crash or revert
    await _handle_decommission_resp(
        session,
        "gw1",
        {"req_id": "r1", "status": "err", "code": "nvs-write"},
    )
    await session.refresh(decommissioned_node)
    assert decommissioned_node.status == "decommissioned"


async def test_resp_err_gateway_mismatch_does_not_revert(
    session: AsyncSession, decommissioned_node: Node
):
    # foreign gateway must not affect a node it doesn't own
    await _handle_decommission_resp(
        session,
        "gw-other",
        {
            "req_id": "r1",
            "node_id": "n-decom",
            "status": "err",
            "code": "nvs-write",
        },
    )
    await session.refresh(decommissioned_node)
    assert decommissioned_node.status == "decommissioned"


async def test_resp_err_unknown_node_id_does_not_crash(session: AsyncSession):
    await _handle_decommission_resp(
        session,
        "gw1",
        {
            "req_id": "r1",
            "node_id": "ghost",
            "status": "err",
            "code": "nvs-write",
        },
    )


async def test_resp_invalid_payload_skipped(
    session: AsyncSession, decommissioned_node: Node
):
    await _handle_decommission_resp(session, "gw1", {"status": "err"})
    await _handle_decommission_resp(session, "gw1", {"req_id": "r1", "status": "weird"})
    await session.refresh(decommissioned_node)
    assert decommissioned_node.status == "decommissioned"

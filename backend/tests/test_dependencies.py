import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    harbor_id_from_adoption_request,
    harbor_id_from_berth,
    harbor_id_from_dock,
    harbor_id_from_gateway,
    harbor_id_from_node,
    require_harbor_authority,
    user_managed_harbor_ids,
)
from app.models import Harbor, User


async def test_require_harbor_authority_passes_for_member(
    session: AsyncSession, harbor_master: User
):
    result = await require_harbor_authority(harbor_master, "h1", session)
    assert result is harbor_master


async def test_require_harbor_authority_403_for_non_member(
    session: AsyncSession, harbor_master: User
):
    session.add(Harbor(harbor_id="h2", name="Other"))
    await session.commit()
    with pytest.raises(HTTPException) as exc:
        await require_harbor_authority(harbor_master, "h2", session)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Not authorized for this harbor"


async def test_require_harbor_authority_403_for_boat_owner(
    session: AsyncSession, boat_owner: User, harbor_h1
):
    with pytest.raises(HTTPException) as exc:
        await require_harbor_authority(boat_owner, "h1", session)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Harbormaster role required"


async def test_user_managed_harbor_ids_returns_membership_set(
    session: AsyncSession, harbor_master: User
):
    assert await user_managed_harbor_ids(harbor_master, session) == {"h1"}


async def test_user_managed_harbor_ids_empty_for_boat_owner(
    session: AsyncSession, boat_owner: User
):
    assert await user_managed_harbor_ids(boat_owner, session) == set()


async def test_harbor_id_from_berth(session: AsyncSession, seeded_berth):
    assert await harbor_id_from_berth("b1", session) == "h1"


async def test_harbor_id_from_berth_404(session: AsyncSession):
    with pytest.raises(HTTPException) as exc:
        await harbor_id_from_berth("nope", session)
    assert exc.value.status_code == 404
    assert exc.value.detail == "Berth not found"


async def test_harbor_id_from_dock(session: AsyncSession, seeded_berth):
    assert await harbor_id_from_dock("d1", session) == "h1"


async def test_harbor_id_from_dock_404(session: AsyncSession):
    with pytest.raises(HTTPException) as exc:
        await harbor_id_from_dock("nope", session)
    assert exc.value.status_code == 404


async def test_harbor_id_from_gateway(session: AsyncSession, harbor_world):
    assert await harbor_id_from_gateway("gw1", session) == "h1"


async def test_harbor_id_from_gateway_404(session: AsyncSession):
    with pytest.raises(HTTPException) as exc:
        await harbor_id_from_gateway("nope", session)
    assert exc.value.status_code == 404


async def test_harbor_id_from_node_404(session: AsyncSession):
    with pytest.raises(HTTPException) as exc:
        await harbor_id_from_node("nope", session)
    assert exc.value.status_code == 404


async def test_harbor_id_from_adoption_request_404(session: AsyncSession):
    with pytest.raises(HTTPException) as exc:
        await harbor_id_from_adoption_request("nope", session)
    assert exc.value.status_code == 404

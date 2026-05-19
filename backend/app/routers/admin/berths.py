"""berth crud + force-reset + admin override"""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.dependencies import SessionDep
from app.events import publish_berth_update
from app.models import Berth, Dock, Node
from app.routers.admin._deps import CfAccessDep

router = APIRouter()


class BerthCreate(BaseModel):
    berth_id: str = Field(min_length=1, max_length=64)
    dock_id: str = Field(min_length=1, max_length=64)
    label: str | None = Field(default=None, max_length=64)
    length_m: float | None = Field(default=None, gt=0)
    width_m: float | None = Field(default=None, gt=0)
    depth_m: float | None = Field(default=None, gt=0)


class BerthPatch(BaseModel):
    label: str | None = Field(default=None, max_length=64)
    length_m: float | None = Field(default=None, gt=0)
    width_m: float | None = Field(default=None, gt=0)
    depth_m: float | None = Field(default=None, gt=0)
    is_reserved: bool | None = None


class BerthAdminOut(BaseModel):
    berth_id: str
    dock_id: str
    label: str | None = None
    length_m: float | None = None
    width_m: float | None = None
    depth_m: float | None = None
    status: str = Field(examples=["free"])
    is_reserved: bool
    sensor_status: str | None = Field(default=None, examples=["free"])
    manual_status: str | None = Field(default=None, examples=["occupied"])
    manual_status_locked: bool = False
    manual_status_set_by: str | None = None
    manual_status_set_at: datetime | None = None


class BerthManualStatusIn(BaseModel):
    status: Literal["free", "occupied"]
    locked: bool = Field(
        default=True,
        description=(
            "true: sensor cannot change displayed status until cleared. "
            "false: next sensor reading consumes the override"
        ),
    )


class BerthManualStatusOut(BaseModel):
    berth_id: str
    status: str
    sensor_status: str | None
    manual_status: str | None
    manual_status_locked: bool
    manual_status_set_by: str | None
    manual_status_set_at: datetime | None


class BerthCreatedOut(BaseModel):
    berth_id: str
    dock_id: str
    label: str | None = None


class BerthPatchOut(BaseModel):
    berth_id: str
    label: str | None = None
    length_m: float | None = None
    width_m: float | None = None
    depth_m: float | None = None
    is_reserved: bool


class BerthResetOut(BaseModel):
    berth_id: str
    status: str


@router.get(
    "/berths",
    response_model=list[BerthAdminOut],
    operation_id="adminListBerths",
)
async def list_berths(session: SessionDep) -> list[dict]:
    rows = (
        (await session.execute(select(Berth).order_by(Berth.dock_id, Berth.berth_id)))
        .scalars()
        .all()
    )
    return [
        {
            "berth_id": b.berth_id,
            "dock_id": b.dock_id,
            "label": b.label,
            "length_m": b.length_m,
            "width_m": b.width_m,
            "depth_m": b.depth_m,
            "status": b.status,
            "is_reserved": b.is_reserved,
            "sensor_status": b.sensor_status,
            "manual_status": b.manual_status,
            "manual_status_locked": b.manual_status_locked,
            "manual_status_set_by": b.manual_status_set_by,
            "manual_status_set_at": b.manual_status_set_at,
        }
        for b in rows
    ]


@router.post(
    "/berths",
    response_model=BerthCreatedOut,
    operation_id="adminCreateBerth",
    status_code=201,
)
async def create_berth(body: BerthCreate, session: SessionDep) -> dict:
    if await session.get(Dock, body.dock_id) is None:
        raise HTTPException(status_code=404, detail=f"Dock {body.dock_id} not found")
    if await session.get(Berth, body.berth_id) is not None:
        raise HTTPException(
            status_code=409, detail=f"Berth {body.berth_id} already exists"
        )
    b = Berth(
        berth_id=body.berth_id,
        dock_id=body.dock_id,
        label=body.label,
        length_m=body.length_m,
        width_m=body.width_m,
        depth_m=body.depth_m,
        status="free",
    )
    session.add(b)
    await session.commit()
    return {"berth_id": b.berth_id, "dock_id": b.dock_id, "label": b.label}


@router.patch(
    "/berths/{berth_id}",
    response_model=BerthPatchOut,
    operation_id="adminPatchBerth",
)
async def patch_berth(berth_id: str, body: BerthPatch, session: SessionDep) -> dict:
    b = await session.get(Berth, berth_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    for field in ("label", "length_m", "width_m", "depth_m", "is_reserved"):
        v = getattr(body, field)
        if v is not None:
            setattr(b, field, v)
    await session.commit()
    return {
        "berth_id": b.berth_id,
        "label": b.label,
        "length_m": b.length_m,
        "width_m": b.width_m,
        "depth_m": b.depth_m,
        "is_reserved": b.is_reserved,
    }


@router.delete("/berths/{berth_id}", operation_id="adminDeleteBerth", status_code=204)
async def delete_berth(berth_id: str, session: SessionDep) -> None:
    b = await session.get(Berth, berth_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    has_node = (
        await session.scalar(
            select(func.count()).select_from(Node).where(Node.berth_id == berth_id)
        )
    ) or 0
    if has_node:
        raise HTTPException(
            status_code=409,
            detail=f"Berth has {has_node} node(s); decommission them first",
        )
    await session.delete(b)
    await session.commit()


@router.post(
    "/berths/{berth_id}/reset",
    response_model=BerthResetOut,
    operation_id="adminResetBerth",
)
async def reset_berth(berth_id: str, session: SessionDep) -> dict:
    b = await session.get(Berth, berth_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    # nuclear: clears sensor telemetry AND any active override
    b.status = "free"
    b.sensor_raw = None
    b.sensor_status = None
    b.manual_status = None
    b.manual_status_locked = False
    b.manual_status_set_by = None
    b.manual_status_set_at = None
    await session.commit()
    return {"berth_id": b.berth_id, "status": b.status}


def _manual_status_payload(b: Berth) -> dict:
    return {
        "berth_id": b.berth_id,
        "status": b.status,
        "sensor_status": b.sensor_status,
        "manual_status": b.manual_status,
        "manual_status_locked": b.manual_status_locked,
        "manual_status_set_by": b.manual_status_set_by,
        "manual_status_set_at": b.manual_status_set_at,
    }


@router.put(
    "/berths/{berth_id}/manual-status",
    response_model=BerthManualStatusOut,
    operation_id="adminSetBerthManualStatus",
    summary="Set an admin override on a berth's status",
)
async def set_manual_status(
    berth_id: str,
    body: BerthManualStatusIn,
    session: SessionDep,
    identity: CfAccessDep,
) -> dict:
    b = await session.get(Berth, berth_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    b.manual_status = body.status
    b.manual_status_locked = body.locked
    b.manual_status_set_by = identity.display
    b.manual_status_set_at = datetime.now(UTC)
    b.status = body.status
    await session.commit()
    await publish_berth_update(session, b)
    return _manual_status_payload(b)


@router.delete(
    "/berths/{berth_id}/manual-status",
    response_model=BerthManualStatusOut,
    operation_id="adminClearBerthManualStatus",
    summary="Clear the admin override, revert to sensor truth",
)
async def clear_manual_status(
    berth_id: str,
    session: SessionDep,
    identity: CfAccessDep,
) -> dict:
    del identity  # auth-only
    b = await session.get(Berth, berth_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    if b.manual_status is None:
        # idempotent: clearing nothing is fine
        return _manual_status_payload(b)
    b.manual_status = None
    b.manual_status_locked = False
    b.manual_status_set_by = None
    b.manual_status_set_at = None
    b.status = b.sensor_status or "free"
    await session.commit()
    await publish_berth_update(session, b)
    return _manual_status_payload(b)

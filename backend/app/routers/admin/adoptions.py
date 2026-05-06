"""adoption admin, list + cancel + bulk delete + sweeper trigger"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.adoption.finalize import complete_adoption_err
from app.adoption.sweeper import prune_old_errors, sweep_once
from app.dependencies import SessionDep
from app.models import AdoptionRequest

router = APIRouter()


class AdoptionAdminOut(BaseModel):
    request_id: str
    mesh_uuid: str
    serial_number: str
    gateway_id: str
    berth_id: str
    status: str = Field(examples=["pending"])
    error_code: str | None = None
    error_msg: str | None = None
    expires_at: datetime
    created_at: datetime
    completed_at: datetime | None = None


class AdoptionCancelOut(BaseModel):
    request_id: str
    status: str
    error_code: str | None = None


class BulkDeleteOut(BaseModel):
    deleted: int
    status_filter: str


class SweeperRunOut(BaseModel):
    expired: int
    pruned: int


@router.get(
    "/adoptions",
    response_model=list[AdoptionAdminOut],
    operation_id="adminListAdoptions",
)
async def list_adoptions(
    session: SessionDep,
    status: str | None = Query(default=None, pattern="^(pending|err|ok)$"),
    limit: int = Query(default=50, ge=1, le=500),
) -> list[dict]:
    stmt = select(AdoptionRequest).order_by(AdoptionRequest.created_at.desc())
    if status is not None:
        stmt = stmt.where(AdoptionRequest.status == status)
    stmt = stmt.limit(limit)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "request_id": r.request_id,
            "mesh_uuid": r.mesh_uuid,
            "serial_number": r.serial_number,
            "gateway_id": r.gateway_id,
            "berth_id": r.berth_id,
            "status": r.status,
            "error_code": r.error_code,
            "error_msg": r.error_msg,
            "expires_at": r.expires_at.isoformat(),
            "created_at": r.created_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in rows
    ]


@router.post(
    "/adoptions/{request_id}/cancel",
    response_model=AdoptionCancelOut,
    operation_id="adminCancelAdoption",
)
async def cancel_adoption(request_id: str, session: SessionDep) -> dict:
    request = await session.get(AdoptionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")
    if request.status != "pending":
        return {
            "request_id": request_id,
            "status": request.status,
            "error_code": request.error_code,
        }
    await complete_adoption_err(session, request_id=request_id, error_code="cancelled")
    await session.refresh(request)
    return {
        "request_id": request.request_id,
        "status": request.status,
        "error_code": request.error_code,
    }


@router.delete(
    "/adoptions",
    response_model=BulkDeleteOut,
    operation_id="adminBulkDeleteAdoptions",
)
async def bulk_delete_adoptions(session: SessionDep, status: str = "err") -> dict:
    """default 'err', pass 'pending' to cancel-and-delete, 'all' to wipe"""
    if status == "all":
        result = await session.execute(delete(AdoptionRequest))
    elif status in {"err", "pending", "ok"}:
        result = await session.execute(
            delete(AdoptionRequest).where(AdoptionRequest.status == status)
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="status must be one of 'err', 'pending', 'ok', 'all'",
        )
    await session.commit()
    return {"deleted": result.rowcount or 0, "status_filter": status}


@router.post(
    "/sweeper/run",
    response_model=SweeperRunOut,
    operation_id="adminRunSweeper",
    summary="Force a sweeper iteration (timeout expired pendings + prune old errs)",
)
async def run_sweeper(session: SessionDep) -> dict:
    expired = await sweep_once(session)
    pruned = await prune_old_errors(session)
    return {"expired": expired, "pruned": pruned}

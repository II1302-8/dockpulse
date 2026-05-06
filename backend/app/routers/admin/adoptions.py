"""adoption admin, cancel + bulk delete + sweeper trigger"""

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete

from app.adoption.finalize import complete_adoption_err
from app.adoption.sweeper import prune_old_errors, sweep_once
from app.dependencies import SessionDep
from app.models import AdoptionRequest

router = APIRouter()


@router.post(
    "/adoptions/{request_id}/cancel",
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
    operation_id="adminRunSweeper",
    summary="Force a sweeper iteration (timeout expired pendings + prune old errs)",
)
async def run_sweeper(session: SessionDep) -> dict:
    expired = await sweep_once(session)
    pruned = await prune_old_errors(session)
    return {"expired": expired, "pruned": pruned}

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import SessionDep, require_harbormaster
from app.models import AdoptionRequest
from app.schemas import AdoptionRequestOut

router = APIRouter(prefix="/api/adoptions", tags=["adoptions"])


@router.get(
    "/{request_id}",
    response_model=AdoptionRequestOut,
    operation_id="getAdoption",
    dependencies=[Depends(require_harbormaster)],
)
async def get_adoption(request_id: str, session: SessionDep):
    request = await session.get(AdoptionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")
    return request

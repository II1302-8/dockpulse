from fastapi import APIRouter, HTTPException

from app.dependencies import HarbormasterDep, SessionDep
from app.models import AdoptionRequest
from app.schemas import AdoptionRequestOut

router = APIRouter(prefix="/api/adoptions", tags=["adoptions"])


@router.get(
    "/{request_id}",
    response_model=AdoptionRequestOut,
    operation_id="getAdoption",
)
async def get_adoption(
    request_id: str,
    current_user: HarbormasterDep,
    session: SessionDep,
):
    request = await session.get(AdoptionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")
    return request

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import AdoptionRequest, User
from app.schemas import AdoptionRequestOut

router = APIRouter(prefix="/api/adoptions", tags=["adoptions"])
sessiondep = Annotated[AsyncSession, Depends(get_session)]
currentuser_dep = Annotated[User, Depends(get_current_user)]


@router.get(
    "/{request_id}",
    response_model=AdoptionRequestOut,
    operation_id="getAdoption",
)
async def get_adoption(
    request_id: str,
    current_user: currentuser_dep,
    session: sessiondep,
):
    if current_user.role != "harbormaster":
        raise HTTPException(status_code=403, detail="Harbormaster role required")

    request = await session.get(AdoptionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Adoption request not found")
    return request

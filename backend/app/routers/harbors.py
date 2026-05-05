from fastapi import APIRouter
from sqlalchemy import select

from app.dependencies import CurrentUserDep, SessionDep
from app.models import Harbor
from app.schemas import HarborOut

router = APIRouter(prefix="/api/harbors", tags=["harbors"])


@router.get(
    "",
    response_model=list[HarborOut],
    operation_id="listHarbors",
    summary="List all harbors",
)
async def list_harbors(
    _: CurrentUserDep,
    session: SessionDep,
) -> list[HarborOut]:
    stmt = select(Harbor).order_by(Harbor.name)
    result = await session.execute(stmt)
    return result.scalars().all()

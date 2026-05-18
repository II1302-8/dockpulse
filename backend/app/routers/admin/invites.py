"""cross-harbor berth-invite listing + revoke for the admin panel"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.dependencies import SessionDep
from app.models import BerthInvite

router = APIRouter()


class AdminInviteOut(BaseModel):
    invite_id: str
    berth_id: str
    harbor_id: str
    email: str
    status: str
    created_at: datetime
    expires_at: datetime


@router.get(
    "/berth-invites",
    response_model=list[AdminInviteOut],
    operation_id="adminListBerthInvites",
)
async def list_invites(
    session: SessionDep,
    harbor_id: Annotated[str | None, Query()] = None,
    status: Annotated[
        str | None,
        Query(pattern="^(pending|accepted|expired|revoked|rejected)$"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[dict]:
    stmt = select(BerthInvite).order_by(BerthInvite.created_at.desc()).limit(limit)
    if harbor_id:
        stmt = stmt.where(BerthInvite.harbor_id == harbor_id)
    if status:
        stmt = stmt.where(BerthInvite.status == status)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "invite_id": r.invite_id,
            "berth_id": r.berth_id,
            "harbor_id": r.harbor_id,
            "email": r.email,
            "status": r.status,
            "created_at": r.created_at,
            "expires_at": r.expires_at,
        }
        for r in rows
    ]


@router.delete(
    "/berth-invites/{invite_id}",
    operation_id="adminRevokeBerthInvite",
    status_code=204,
)
async def revoke_invite(invite_id: str, session: SessionDep) -> None:
    row = await session.get(BerthInvite, invite_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    await session.delete(row)
    await session.commit()

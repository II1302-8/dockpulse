import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.config import get_settings
from app.dependencies import CurrentUserDep, SessionDep
from app.models import Assignment, BerthInvite, UserHarborRole
from app.notifications import send_email
from app.schemas import AssignmentInvitationOut

router = APIRouter(prefix="/api", tags=["berth-invites"])


def create_invite_token() -> str:
    """Create invitation token"""
    token = secrets.token_urlsafe(32)
    return token


def hash_invite_token(token: str) -> str:
    """Hash invitation token"""
    token_hash = sha256(token.encode("utf-8")).hexdigest()
    return token_hash


def verify_invite_token(token: str, token_hash: str) -> bool:
    """Verify invitaiton token"""
    new_token_hash = hash_invite_token(token)
    return hmac.compare_digest(new_token_hash, token_hash)


@router.post(
    "/harbors/{harbor_id}/berth-invites", response_model=AssignmentInvitationOut
)
async def create_berth_invite(
    harbor_id: str,
    berth_id: str,
    email: str,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    """
    POST   /api/harbors/{harbor_id}/berth-invites — harbormaster only.
    Body {berth_id, email}. 409 if a pending invite already exists for the berth.
    """
    stmt = select(UserHarborRole).where(
        UserHarborRole.role == "harbor_master",
        UserHarborRole.harbor_id == harbor_id,
        UserHarborRole.user_id == current_user.user_id,
    )
    result = await session.execute(stmt)
    harbor_master = result.scalars().first()
    if not harbor_master:
        raise HTTPException(status_code=403, detail="Not authorized")

    stmt = select(BerthInvite).where()
    result = await session.execute(stmt)
    previous_invitation = result.scalars().first()
    if previous_invitation:
        raise HTTPException(
            status_code=409, detail="Invitation on chosen berth already pending"
        )

    token = create_invite_token()
    token_hash = hash_invite_token(token)
    settings = get_settings()
    subject = f"You've been assigned a berth - {berth_id}"
    html = f"""
    <p>
        You have been invited as a tenant of the berth
        <strong>{berth_id}</strong>.
    </p>
    <p>
        Make your choice by pressing the correct link below:
    <br>
    <a href='https://www.dockpulse.xyz/accept?token={token}' style='color:green;'>
        Accept the berth
    </a>
    <a href='https://www.dockpulse.xyz/reject?token={token}' style='color:red;'>
        Rejectt the berth
    </a>
    </p>
    """
    send_email(email, subject, html)
    session.add(
        BerthInvite(
            invite_id=str(uuid.uuid4()),
            berth_id=berth_id,
            harbor_id=harbor_id,
            email=email,
            token_hash=token_hash,
            created_by=current_user.user_id,
            created_at=datetime.now(),
            expires_at=datetime.now(UTC)
            + timedelta(hours=settings.invitation_token_ttl_hours),
            status="pending",
        )
    )

    return AssignmentInvitationOut(berth_id=berth_id, email=email)


@router.get("/berth-invites/by-token/{token}", response_model=AssignmentInvitationOut)
async def berth_invite_token_info(token: str, session: SessionDep):
    """
    GET    /api/berth-invites/by-token/{token} — public.
    Returns berth label, harbor name, email, status, expires_at. 410 on terminal state.
    404 on unknown token.
    """
    new_token_hash = hash_invite_token(token)

    stmt = select(BerthInvite).where(BerthInvite.token_hash == new_token_hash)
    result = await session.execute(stmt)
    matching_token_row = result.scalar_or_none()

    if matching_token_row:
        return AssignmentInvitationOut(
            berth_id=matching_token_row.berth_id,
            email=matching_token_row.email,
            harbor_id=matching_token_row.harbor_id,
            status=matching_token_row.status,
            expires_at=matching_token_row.expires_at,
        )

    raise HTTPException(status_code=404, detail="Token not found")
    #   410 ???


@router.post(
    "/berth-invites/by-token/{token}/accept", response_model=AssignmentInvitationOut
)
async def accept_berth_invite(
    token: str, session: SessionDep, current_user: CurrentUserDep
):
    """
    POST   /api/berth-invites/by-token/{token}/accept
    Authed, user.email must match invite.email (case-insensitive).
    Atomic: assigns berth + transitions role + releases prior berth.
    """
    new_token_hash = hash_invite_token(token)

    stmt = select(BerthInvite).where(BerthInvite.token_hash == new_token_hash)
    result = await session.execute(stmt)
    matching_token_row = result.scalar_or_none()

    if matching_token_row:
        if current_user.email.lower() != matching_token_row.email.lower():
            raise HTTPException(status_code=403, detail="Incorrect email")
        if (
            matching_token_row.status != "pending"
            or matching_token_row.expires_at < datetime.now()
        ):
            raise HTTPException(
                status_code=400,
                detail="Token is not valid anymore",
            )
        matching_token_row.status = "accepted"
        matching_token_row.accepted_by = current_user.user_id
        matching_token_row.accepted_at = datetime.now(UTC)

        await session.commit()
        await session.refresh(matching_token_row)

        berth_id = matching_token_row.berth_id

        stmt = select(Assignment).where(Assignment.berth_id == berth_id)
        result = await session.execute(stmt)
        old_assignment = result.scalars().first()
        await session.delete(old_assignment)

        new_assignment = Assignment(
            user_id=current_user.user_id,
            berth_id=berth_id,
            harbor_id=matching_token_row.harbor_id,
            email=matching_token_row.email,
            status=matching_token_row.status,
            expires_at=matching_token_row.expires_at,
        )
        session.add(new_assignment)

        return {"Success": "invitation accepted"}
    raise HTTPException(status_code=404, detail="Token not found")


@router.post("/berth-invites/by-token/{token}/reject")
async def reject_berth_invite(
    token: str, session: SessionDep, current_user: CurrentUserDep
):
    """
    POST   /api/berth-invites/by-token/{token}/reject — authed.
    """
    new_token_hash = hash_invite_token(token)

    stmt = select(BerthInvite).where(BerthInvite.token_hash == new_token_hash)
    result = await session.execute(stmt)
    matching_token_row = result.scalar_or_none()

    if matching_token_row:
        if current_user.email.lower() != matching_token_row.email.lower():
            raise HTTPException(status_code=403, detail="Incorrect email")
        if (
            matching_token_row.status != "pending"
            or matching_token_row.expires_at < datetime.now()
        ):
            raise HTTPException(
                status_code=400,
                detail="Token is not valid anymore",
            )
        matching_token_row.status = "rejected"
        matching_token_row.accepted_by = current_user.user_id
        matching_token_row.accepted_at = datetime.now(UTC)

        await session.commit()
        await session.refresh(matching_token_row)
        return
    raise HTTPException()


@router.delete("/harbors/{harbor_id}/berth-invites/{id}", status_code=204)
async def delete_berth_invite(
    harbor_id: str, id: str, current_user: CurrentUserDep, session: SessionDep
):
    """
    DELETE /api/harbors/{harbor_id}/berth-invites/{id} — harbormaster.
    """
    stmt = select(BerthInvite).where(
        BerthInvite.invite_id == id, BerthInvite.harbor_id == harbor_id
    )
    result = await session.execute(stmt)
    invitation = result.scalar_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    stmt = select(UserHarborRole).where(
        UserHarborRole.user_id == current_user.user_id,
        UserHarborRole.harbor_id == harbor_id,
        UserHarborRole.role == "harbor_master",
    )
    result = await session.execute(stmt)
    correct_harbor_master = result.scalars().first()
    if not correct_harbor_master:
        raise HTTPException(
            status_code=403, detail="Not authorized to delete invitation"
        )
    await session.delete(invitation)
    await session.commit()


@router.get("/harbors/{harbor_id}/berth-invites", response_model=list[BerthInvite])
async def get_pending_invites_for_harbor(
    harbor_id: str, status: str, session: SessionDep
):
    """
    GET /api/harbors/{harbor_id}/berth-invites?status=pending
    """
    stmt = select(BerthInvite).where(BerthInvite.status == status, BerthInvite.harbor_id == harbor_id)
    result = await session.execute(stmt)
    invitations = result.scalars().all()
    if not invitations:
        raise HTTPException(status_code=404, detail="No invitations found")
    return invitations

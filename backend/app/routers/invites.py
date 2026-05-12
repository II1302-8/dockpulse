import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from fastapi import APIRouter, BackgroundTasks, HTTPException
from sqlalchemy import select, update

from app import notifications
from app.config import get_settings
from app.dependencies import (
    CurrentUserDep,
    HarbormasterForHarborDep,
    SessionDep,
)
from app.models import Assignment, BerthInvite
from app.schemas import BerthInviteCreate, BerthInviteOut

router = APIRouter(prefix="/api", tags=["berth-invites"])


def _create_invite_token() -> str:
    return secrets.token_urlsafe(32)


def _hash_invite_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def _verify_invite_token(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(_hash_invite_token(token), token_hash)


def _is_active(invite: BerthInvite, now: datetime) -> bool:
    return invite.status == "pending" and invite.expires_at > now


def _to_out(invite: BerthInvite) -> BerthInviteOut:
    return BerthInviteOut(
        invite_id=invite.invite_id,
        berth_id=invite.berth_id,
        harbor_id=invite.harbor_id,
        email=invite.email,
        status=invite.status,
        expires_at=invite.expires_at,
    )


@router.post(
    "/harbors/{harbor_id}/berth-invites",
    response_model=BerthInviteOut,
    status_code=201,
    operation_id="createBerthInvite",
    summary="Create a berth invite (harbormaster only)",
)
async def create_berth_invite(
    harbor_id: str,
    body: BerthInviteCreate,
    session: SessionDep,
    hm: HarbormasterForHarborDep,
    background_tasks: BackgroundTasks,
):
    # berth must belong to this harbor; the partial unique index then
    # guarantees at most one pending invite per berth
    existing = await session.execute(
        select(BerthInvite).where(
            BerthInvite.berth_id == body.berth_id,
            BerthInvite.status == "pending",
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409, detail="Berth already has a pending invite"
        )

    settings = get_settings()
    now = datetime.now(UTC)
    token = _create_invite_token()
    invite = BerthInvite(
        invite_id=str(uuid.uuid4()),
        berth_id=body.berth_id,
        harbor_id=harbor_id,
        email=body.email,
        token_hash=_hash_invite_token(token),
        created_by=hm.user_id,
        created_at=now,
        expires_at=now + timedelta(hours=settings.invitation_token_ttl_hours),
        status="pending",
    )
    session.add(invite)
    await session.commit()
    await session.refresh(invite)

    accept_url = f"{settings.app_base_url}/accept?token={token}"
    reject_url = f"{settings.app_base_url}/reject?token={token}"
    html = (
        f"<p>You have been invited to claim berth <strong>{body.berth_id}</strong>."
        f"</p><p>"
        f'<a href="{accept_url}">Accept</a> &middot; '
        f'<a href="{reject_url}">Reject</a></p>'
    )
    background_tasks.add_task(
        notifications.send_email,
        to=body.email,
        subject=f"You've been invited to berth {body.berth_id}",
        html=html,
    )
    return _to_out(invite)


@router.get(
    "/berth-invites/by-token/{token}",
    response_model=BerthInviteOut,
    operation_id="getBerthInviteByToken",
    summary="Look up an invite by its token (public)",
)
async def get_berth_invite_by_token(token: str, session: SessionDep):
    token_hash = _hash_invite_token(token)
    result = await session.execute(
        select(BerthInvite).where(BerthInvite.token_hash == token_hash)
    )
    invite = result.scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    if not _is_active(invite, datetime.now(UTC)):
        raise HTTPException(status_code=410, detail="Invite is no longer valid")
    return _to_out(invite)


@router.post(
    "/berth-invites/by-token/{token}/accept",
    response_model=BerthInviteOut,
    operation_id="acceptBerthInvite",
    summary="Accept an invite (authed, must match invite email)",
)
async def accept_berth_invite(
    token: str, session: SessionDep, current_user: CurrentUserDep
):
    token_hash = _hash_invite_token(token)
    now = datetime.now(UTC)

    # atomic claim, only the row still in 'pending' transitions to 'accepted'
    claim = await session.execute(
        update(BerthInvite)
        .where(
            BerthInvite.token_hash == token_hash,
            BerthInvite.status == "pending",
            BerthInvite.expires_at > now,
        )
        .values(
            status="accepted",
            accepted_by=current_user.user_id,
            accepted_at=now,
        )
        .returning(BerthInvite)
    )
    invite = claim.scalar_one_or_none()
    if invite is None:
        # distinguish wrong-email from gone/expired, look up by hash to decide
        existing = (
            await session.execute(
                select(BerthInvite).where(BerthInvite.token_hash == token_hash)
            )
        ).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status_code=404, detail="Invite not found")
        raise HTTPException(status_code=410, detail="Invite is no longer valid")

    if current_user.email.lower() != invite.email.lower():
        # invite is now claimed by this user but their email did not match,
        # roll back so the invite stays pending for the rightful recipient
        await session.rollback()
        raise HTTPException(status_code=403, detail="Invite is for a different email")

    # replace any existing assignment on the berth in the same tx
    await session.execute(
        Assignment.__table__.delete().where(
            Assignment.berth_id == invite.berth_id
        )
    )
    session.add(Assignment(berth_id=invite.berth_id, user_id=current_user.user_id))
    await session.commit()
    await session.refresh(invite)
    return _to_out(invite)


@router.post(
    "/berth-invites/by-token/{token}/reject",
    response_model=BerthInviteOut,
    operation_id="rejectBerthInvite",
    summary="Reject an invite (authed, must match invite email)",
)
async def reject_berth_invite(
    token: str, session: SessionDep, current_user: CurrentUserDep
):
    token_hash = _hash_invite_token(token)
    now = datetime.now(UTC)

    invite = (
        await session.execute(
            select(BerthInvite).where(BerthInvite.token_hash == token_hash)
        )
    ).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    if current_user.email.lower() != invite.email.lower():
        raise HTTPException(status_code=403, detail="Invite is for a different email")
    if not _is_active(invite, now):
        raise HTTPException(status_code=410, detail="Invite is no longer valid")

    result = await session.execute(
        update(BerthInvite)
        .where(
            BerthInvite.invite_id == invite.invite_id,
            BerthInvite.status == "pending",
        )
        .values(status="rejected", accepted_by=current_user.user_id, accepted_at=now)
        .returning(BerthInvite)
    )
    rejected = result.scalar_one_or_none()
    if rejected is None:
        raise HTTPException(status_code=410, detail="Invite is no longer valid")
    await session.commit()
    await session.refresh(rejected)
    return _to_out(rejected)


@router.delete(
    "/harbors/{harbor_id}/berth-invites/{invite_id}",
    status_code=204,
    operation_id="deleteBerthInvite",
    summary="Revoke a pending invite (harbormaster only)",
)
async def delete_berth_invite(
    harbor_id: str,
    invite_id: str,
    session: SessionDep,
    hm: HarbormasterForHarborDep,
):
    invite = (
        await session.execute(
            select(BerthInvite).where(
                BerthInvite.invite_id == invite_id,
                BerthInvite.harbor_id == harbor_id,
            )
        )
    ).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    await session.delete(invite)
    await session.commit()


@router.get(
    "/harbors/{harbor_id}/berth-invites",
    response_model=list[BerthInviteOut],
    operation_id="listBerthInvites",
    summary="List invites for a harbor (harbormaster only)",
)
async def list_berth_invites(
    harbor_id: str,
    session: SessionDep,
    hm: HarbormasterForHarborDep,
    status: str | None = None,
):
    stmt = select(BerthInvite).where(BerthInvite.harbor_id == harbor_id)
    if status is not None:
        stmt = stmt.where(BerthInvite.status == status)
    rows = (await session.execute(stmt)).scalars().all()
    return [_to_out(inv) for inv in rows]

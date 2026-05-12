import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import joinedload

from app import notifications
from app.config import get_settings
from app.dependencies import (
    CurrentUserDep,
    HarbormasterForHarborDep,
    SessionDep,
)
from app.models import Assignment, Berth, BerthInvite, Dock, Harbor
from app.schemas import BerthInviteCreate, BerthInviteList, BerthInviteOut

router = APIRouter(prefix="/api", tags=["berth-invites"])


def _create_invite_token() -> str:
    return secrets.token_urlsafe(32)


def _hash_invite_token(token: str) -> bytes:
    return sha256(token.encode("utf-8")).digest()


def _verify_invite_token(token: str, token_hash: bytes) -> bool:
    return hmac.compare_digest(_hash_invite_token(token), token_hash)


def _is_active(invite: BerthInvite, now: datetime) -> bool:
    return invite.status == "pending" and invite.expires_at > now


def _to_out(
    invite: BerthInvite,
    *,
    berth_label: str | None = None,
    harbor_name: str | None = None,
) -> BerthInviteOut:
    loaded_label = (
        invite.berth.label if "berth" in invite.__dict__ and invite.berth else None
    )
    return BerthInviteOut(
        invite_id=invite.invite_id,
        berth_id=invite.berth_id,
        berth_label=berth_label or loaded_label,
        harbor_id=invite.harbor_id,
        harbor_name=harbor_name,
        email=invite.email,
        status=invite.status,
        expires_at=invite.expires_at,
    )


async def _berth_harbor_id(session, berth_id: str) -> str | None:
    return (
        await session.execute(
            select(Dock.harbor_id)
            .join(Berth, Berth.dock_id == Dock.dock_id)
            .where(Berth.berth_id == berth_id)
        )
    ).scalar_one_or_none()


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
    # berth must actually belong to the harbor the hm controls,
    # otherwise an hm of A could invite for a berth in B
    berth_harbor = await _berth_harbor_id(session, body.berth_id)
    if berth_harbor is None:
        raise HTTPException(status_code=404, detail="Berth not found")
    if berth_harbor != harbor_id:
        raise HTTPException(
            status_code=403, detail="Berth does not belong to this harbor"
        )

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

    accept_url = f"{settings.app_base_url}/accept-berth?token={token}"
    reject_url = f"{settings.app_base_url}/reject-berth?token={token}"
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
        idempotency_key=f"berth-invite:{invite.invite_id}",
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
    # join berth + harbor so the unauth caller sees human-readable label/name
    result = await session.execute(
        select(BerthInvite, Berth.label, Harbor.name)
        .join(Berth, Berth.berth_id == BerthInvite.berth_id)
        .join(Harbor, Harbor.harbor_id == BerthInvite.harbor_id)
        .where(BerthInvite.token_hash == token_hash)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite, berth_label, harbor_name = row
    if not _is_active(invite, datetime.now(UTC)):
        raise HTTPException(status_code=410, detail="Invite is no longer valid")
    return _to_out(invite, berth_label=berth_label, harbor_name=harbor_name)


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

    # check email match before claiming so a wrong recipient never transitions
    # status; concurrent legit claims still race-safe via the UPDATE below
    invite = (
        await session.execute(
            select(BerthInvite).where(BerthInvite.token_hash == token_hash)
        )
    ).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    # CITEXT makes server-side compare case-insensitive, .lower() is belt+braces
    if current_user.email.lower() != invite.email.lower():
        raise HTTPException(status_code=403, detail="Invite is for a different email")
    if not _is_active(invite, now):
        raise HTTPException(status_code=410, detail="Invite is no longer valid")

    claim = await session.execute(
        update(BerthInvite)
        .where(
            BerthInvite.invite_id == invite.invite_id,
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
    claimed = claim.scalar_one_or_none()
    if claimed is None:
        raise HTTPException(status_code=410, detail="Invite is no longer valid")

    # release any prior assignment this user held (one boat-owner = one berth)
    await session.execute(
        Assignment.__table__.delete().where(Assignment.user_id == current_user.user_id)
    )
    # clear whoever previously held the target berth
    await session.execute(
        Assignment.__table__.delete().where(Assignment.berth_id == claimed.berth_id)
    )
    session.add(Assignment(berth_id=claimed.berth_id, user_id=current_user.user_id))
    await session.commit()
    await session.refresh(claimed)
    return _to_out(claimed)


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
    response_model=BerthInviteList,
    operation_id="listBerthInvites",
    summary="List invites for a harbor, paginated (harbormaster only)",
)
async def list_berth_invites(
    harbor_id: str,
    session: SessionDep,
    hm: HarbormasterForHarborDep,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    where = [BerthInvite.harbor_id == harbor_id]
    if status is not None:
        where.append(BerthInvite.status == status)

    total = (
        await session.execute(
            select(func.count()).select_from(BerthInvite).where(*where)
        )
    ).scalar_one()

    rows = (
        (
            await session.execute(
                select(BerthInvite)
                .where(*where)
                .options(joinedload(BerthInvite.berth))
                .order_by(BerthInvite.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )

    return BerthInviteList(items=[_to_out(inv) for inv in rows], total=total)

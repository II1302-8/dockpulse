from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from sqlalchemy import select, update

from app import notifications
from app.auth import ALGORITHM
from app.config import get_settings
from app.dependencies import (
    CurrentUserDep,
    HarbormasterForBerthDep,
    SessionDep,
    user_is_harbormaster,
)
from app.models import Assignment, User, UserNotificationPrefs
from app.rate_limit import limiter
from app.schemas import (
    NotificationPrefsOut,
    NotificationPrefsPatch,
    PasswordResetConfirm,
    PasswordResetOut,
    PasswordResetRequest,
    UserOut,
    UserPatch,
)
from app.serializers import assigned_berth_id as _assigned_berth_id
from app.serializers import to_user_out

router = APIRouter(prefix="/api/users", tags=["users"])

_ph = PasswordHasher()


def _hash_password(password: str) -> str:
    return _ph.hash(password)


@router.post(
    "/reset",
    status_code=204,
    operation_id="requestPasswordReset",
    summary="Send a password reset email if the address is registered",
)
@limiter.limit(lambda: get_settings().rate_limit_password_reset)
async def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    session: SessionDep,
    background_tasks: BackgroundTasks,
):
    user = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if user is None:
        return
    settings = get_settings()
    now = datetime.now(UTC)
    # tv binds token to current session version so a confirm invalidates
    # all other in-flight reset tokens for the same user
    token = jwt.encode(
        {
            "type": "password_reset",
            "sub": user.user_id,
            "email": user.email,
            "tv": user.token_version,
            "iat": now,
            "exp": now + timedelta(hours=1),
        },
        settings.secret_key,
        algorithm=ALGORITHM,
    )
    reset_url = f"{settings.app_base_url}/resetpassword/{token}"
    # background task keeps unknown/known email paths timing-equivalent
    background_tasks.add_task(
        notifications.send_email,
        to=user.email,
        subject="Reset your DockPulse password",
        html=(
            f"<p>Click the link below to reset your DockPulse password. "
            f"The link expires in 60 minutes.</p>"
            f'<p><a href="{reset_url}">{reset_url}</a></p>'
        ),
    )


@router.post(
    "/resetpassword",
    response_model=PasswordResetOut,
    operation_id="confirmPasswordReset",
    summary="Apply a new password using a reset token",
)
async def confirm_password_reset(body: PasswordResetConfirm, session: SessionDep):
    try:
        payload = jwt.decode(
            body.token, get_settings().secret_key, algorithms=[ALGORITHM]
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=403, detail="Invalid or expired reset token"
        ) from None
    if payload.get("type") != "password_reset":
        raise HTTPException(status_code=403, detail="Invalid or expired reset token")
    user_id = payload.get("sub")
    token_email = payload.get("email")
    if not isinstance(user_id, str) or not isinstance(token_email, str):
        raise HTTPException(status_code=403, detail="Invalid or expired reset token")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=403, detail="Invalid or expired reset token")
    if user.email != token_email:
        raise HTTPException(status_code=403, detail="Invalid or expired reset token")
    # tv mismatch means user.token_version moved on (prior reset / logout-all)
    # rejecting here makes a successful reset invalidate all other live tokens
    if payload.get("tv") != user.token_version:
        raise HTTPException(status_code=403, detail="Invalid or expired reset token")
    await session.execute(
        update(User)
        .where(User.user_id == user_id)
        .values(
            password_hash=_hash_password(body.password.get_secret_value()),
            token_version=User.token_version + 1,
        )
    )
    await session.commit()
    return PasswordResetOut(
        message="Password reset successful", invite_token=body.invite_token
    )


@router.get(
    "",
    response_model=UserOut,
    operation_id="getUserByBerth",
    summary="Get the user assigned to a berth",
)
async def get_user_by_berth(
    session: SessionDep,
    _: HarbormasterForBerthDep,
    berth_id: Annotated[str, Query(description="berth to look up assigned user for")],
):
    user_id = (
        await session.execute(
            select(Assignment.user_id).where(Assignment.berth_id == berth_id)
        )
    ).scalar_one_or_none()
    if user_id is None:
        raise HTTPException(status_code=404, detail="No user assigned to this berth")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return await to_user_out(session, user, berth_id)


@router.get(
    "/me",
    response_model=UserOut,
    operation_id="getMe",
    summary="Get current user profile",
)
async def get_me(current_user: CurrentUserDep, session: SessionDep):
    berth_id = await _assigned_berth_id(session, current_user.user_id)
    return await to_user_out(session, current_user, berth_id)


@router.patch(
    "/me",
    response_model=UserOut,
    operation_id="updateMe",
    summary="Update current user profile",
)
async def update_me(body: UserPatch, current_user: CurrentUserDep, session: SessionDep):
    if body.email and body.email != current_user.email:
        existing = await session.execute(select(User).where(User.email == body.email))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Email already in use")

    for field in ("firstname", "lastname", "email", "phone", "boat_club"):
        value = getattr(body, field)
        if value is not None:
            setattr(current_user, field, value)

    if body.password is not None:
        if body.current_password is None:
            raise HTTPException(
                status_code=422,
                detail="Current password is required to change password.",
            )
        try:
            _ph.verify(
                current_user.password_hash,
                body.current_password.get_secret_value(),
            )
        except VerifyMismatchError:
            raise HTTPException(
                status_code=401, detail="Current password is incorrect."
            ) from None
        current_user.password_hash = _hash_password(body.password.get_secret_value())

    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    berth_id = await _assigned_berth_id(session, current_user.user_id)
    return await to_user_out(session, current_user, berth_id)


@router.delete(
    "/me",
    status_code=204,
    operation_id="deleteMe",
    summary="Delete the current boat-owner account",
)
async def delete_me(current_user: CurrentUserDep, session: SessionDep):
    # harbormasters own hardware adoption records, offboarding is admin-only
    if await user_is_harbormaster(current_user, session):
        raise HTTPException(
            status_code=403,
            detail="Harbormaster accounts cannot be self-deleted",
        )
    await session.delete(current_user)
    await session.commit()


@router.get(
    "/me/notification-prefs",
    response_model=NotificationPrefsOut,
    operation_id="getNotificationPrefs",
    summary="Get notification preferences for the current user",
)
async def get_notification_prefs(current_user: CurrentUserDep, session: SessionDep):
    prefs = await session.get(UserNotificationPrefs, current_user.user_id)
    if prefs is None:
        return NotificationPrefsOut(
            notify_arrival=True,
            notify_departure=True,
        )
    return prefs


@router.patch(
    "/me/notification-prefs",
    response_model=NotificationPrefsOut,
    operation_id="updateNotificationPrefs",
    summary="Update notification preferences for the current user",
)
async def update_notification_prefs(
    body: NotificationPrefsPatch,
    current_user: CurrentUserDep,
    session: SessionDep,
):
    prefs = await session.get(UserNotificationPrefs, current_user.user_id)
    if prefs is None:
        prefs = UserNotificationPrefs(user_id=current_user.user_id)
        session.add(prefs)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(prefs, field, value)

    await session.commit()
    await session.refresh(prefs)
    return prefs

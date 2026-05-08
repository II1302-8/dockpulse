from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.dependencies import (
    CurrentUserDep,
    HarbormasterForBerthDep,
    SessionDep,
    user_is_harbormaster,
)
from app.models import Assignment, User, UserNotificationPrefs
from app.schemas import (
    NotificationPrefsOut,
    NotificationPrefsPatch,
    UserOut,
    UserPatch,
)
from app.serializers import assigned_berth_id as _assigned_berth_id
from app.serializers import to_user_out

router = APIRouter(prefix="/api/users", tags=["users"])

_ph = PasswordHasher()


def _hash_password(password: str) -> str:
    return _ph.hash(password)


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

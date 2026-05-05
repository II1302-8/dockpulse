from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.dependencies import CurrentUserDep, SessionDep
from app.models import AdoptionRequest, Node, User, UserNotificationPrefs
from app.schemas import (
    NotificationPrefsOut,
    NotificationPrefsPatch,
    UserOut,
    UserPatch,
)

router = APIRouter(prefix="/api/users", tags=["users"])

_ph = PasswordHasher()


def _hash_password(password: str) -> str:
    return _ph.hash(password)


@router.get(
    "/me",
    response_model=UserOut,
    operation_id="getMe",
    summary="Get current user profile",
)
async def get_me(current_user: CurrentUserDep):
    return current_user


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
    return current_user


@router.delete(
    "/me",
    status_code=204,
    operation_id="deleteMe",
    summary="Delete the current user's account",
)
async def delete_me(current_user: CurrentUserDep, session: SessionDep):
    # block account deletion while the user still owns adopted hardware,
    # otherwise cascading would orphan physical nodes from their owner record
    owns_nodes = await session.execute(
        select(Node.node_id)
        .where(Node.adopted_by_user_id == current_user.user_id)
        .limit(1)
    )
    if owns_nodes.first() is not None:
        raise HTTPException(
            status_code=409,
            detail="Release adopted nodes before deleting the account",
        )
    owns_requests = await session.execute(
        select(AdoptionRequest.request_id)
        .where(
            AdoptionRequest.created_by_user_id == current_user.user_id,
            AdoptionRequest.status == "pending",
        )
        .limit(1)
    )
    if owns_requests.first() is not None:
        raise HTTPException(
            status_code=409,
            detail="Resolve pending adoption requests before deleting the account",
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

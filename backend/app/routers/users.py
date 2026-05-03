import uuid

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.auth import create_access_token
from app.dependencies import CurrentUserDep, SessionDep
from app.models import User, UserNotificationPrefs
from app.schemas import (
    LoginIn,
    NotificationPrefsOut,
    NotificationPrefsPatch,
    TokenOut,
    UserCreate,
    UserOut,
    UserPatch,
)

router = APIRouter(prefix="/api/users", tags=["users"])

_ph = PasswordHasher()
# Precomputed dummy hash so unknown-email logins still pay the verify cost,
# preventing user enumeration via response timing.
_DUMMY_HASH = _ph.hash("dummy-password-for-timing-equalization")


def _hash_password(password: str) -> str:
    return _ph.hash(password)


@router.post(
    "",
    response_model=UserOut,
    status_code=201,
    operation_id="registerUser",
    summary="Register a new user",
)
async def register_user(body: UserCreate, session: SessionDep):
    existing = await session.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email already in use")

    user = User(
        user_id=str(uuid.uuid4()),
        firstname=body.firstname,
        lastname=body.lastname,
        email=body.email,
        phone=body.phone,
        boat_club=body.boat_club,
        password_hash=_hash_password(body.password.get_secret_value()),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.post(
    "/token",
    response_model=TokenOut,
    operation_id="login",
    summary="Log in and obtain an access token",
)
async def login(body: LoginIn, session: SessionDep):
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    target_hash = user.password_hash if user is not None else _DUMMY_HASH
    try:
        _ph.verify(target_hash, body.password.get_secret_value())
    except VerifyMismatchError:
        raise HTTPException(status_code=401, detail="Invalid credentials") from None
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenOut(access_token=create_access_token(user))


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
        current_user.password_hash = _hash_password(body.password.get_secret_value())

    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user


@router.post(
    "/me/logout",
    status_code=204,
    operation_id="logout",
    summary="Invalidate all tokens for the current user",
)
async def logout(current_user: CurrentUserDep, session: SessionDep):
    current_user.token_version += 1
    session.add(current_user)
    await session.commit()


@router.get(
    "/me/notifications",
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
    "/me/notifications",
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

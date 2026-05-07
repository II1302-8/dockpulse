import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, BackgroundTasks, Cookie, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.auth import (
    ALGORITHM,
    REFRESH_COOKIE,
    clear_session_cookies,
    create_access_token,
    create_refresh_token,
    generate_csrf_token,
    set_session_cookies,
)
from app.config import get_settings
from app.dependencies import CurrentUserDep, SessionDep
from app.models import RefreshToken, User, UserVerification
from app.notifications import send_account_exists_email, send_verification_email
from app.rate_limit import limiter
from app.schemas import LoginIn, UserCreate, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

_ph = PasswordHasher()
# dummy hash so unknown email still pays verify cost — blocks user enum via timing
_DUMMY_HASH = _ph.hash("dummy-password-for-timing-equalization")


def _hash_password(password: str) -> str:
    return _ph.hash(password)


async def _issue_session(
    user: User,
    response: Response,
    session: SessionDep,
    *,
    replaces_jti: str | None = None,
) -> None:
    refresh_token, _ = await create_refresh_token(
        user, session, replaces_jti=replaces_jti
    )
    set_session_cookies(
        response,
        access_token=create_access_token(user),
        refresh_token=refresh_token,
        csrf_token=generate_csrf_token(),
    )


async def _invalidate_verification_tokens(user_id: str, session: SessionDep) -> None:
    await session.execute(
        update(UserVerification)
        .where(UserVerification.user_id == user_id, UserVerification.used.is_(False))
        .values(used=True)
    )


def _create_verification_token(user_id: str, session: SessionDep, settings) -> str:
    token = secrets.token_urlsafe(32)
    session.add(
        UserVerification(
            user_id=user_id,
            token=token,
            expires_at=datetime.now(UTC)
            + timedelta(hours=settings.verification_token_ttl_hours),
        )
    )
    return token


@router.post(
    "/register",
    status_code=201,
    operation_id="registerUser",
    summary="Register a new user",
)
@limiter.limit(lambda: get_settings().rate_limit_register)
async def register(
    request: Request,
    body: UserCreate,
    session: SessionDep,
    background_tasks: BackgroundTasks,
):
    settings = get_settings()
    result = await session.execute(select(User).where(User.email == body.email))
    existing = result.scalar_one_or_none()

    if existing is not None:
        if not existing.email_verified:
            await _invalidate_verification_tokens(existing.user_id, session)
            token = _create_verification_token(existing.user_id, session, settings)
            await session.commit()
            background_tasks.add_task(
                send_verification_email,
                email=existing.email,
                token=token,
                firstname=existing.firstname,
            )
        else:
            background_tasks.add_task(
                send_account_exists_email,
                email=existing.email,
                firstname=existing.firstname,
            )
        return {"message": "Check your email to verify your account"}

    user = User(
        user_id=str(uuid.uuid4()),
        firstname=body.firstname,
        lastname=body.lastname,
        email=body.email,
        phone=body.phone,
        boat_club=body.boat_club,
        password_hash=_hash_password(body.password.get_secret_value()),
        email_verified=False,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        return {"message": "Check your email to verify your account"}

    token = _create_verification_token(user.user_id, session, settings)
    await session.commit()
    background_tasks.add_task(
        send_verification_email,
        email=user.email,
        token=token,
        firstname=user.firstname,
    )
    return {"message": "Check your email to verify your account"}


@router.post(
    "/login",
    response_model=UserOut,
    operation_id="login",
    summary="Log in and set session cookies",
)
@limiter.limit(lambda: get_settings().rate_limit_login)
async def login(
    request: Request, body: LoginIn, session: SessionDep, response: Response
):
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    target_hash = user.password_hash if user is not None else _DUMMY_HASH
    try:
        _ph.verify(target_hash, body.password.get_secret_value())
    except VerifyMismatchError:
        raise HTTPException(status_code=401, detail="Invalid credentials") from None
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await _issue_session(user, response, session)
    await session.commit()
    return user


@router.get(
    "/me",
    response_model=UserOut,
    operation_id="getCurrentUser",
    summary="Return the authenticated user",
)
async def me(current_user: CurrentUserDep) -> User:
    return current_user


@router.post(
    "/refresh",
    status_code=204,
    operation_id="refreshSession",
    summary="Rotate the refresh cookie and reissue the access cookie",
)
async def refresh_session(
    response: Response,
    session: SessionDep,
    refresh_cookie: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
):
    if refresh_cookie is None:
        raise HTTPException(status_code=401, detail="Missing refresh cookie")
    try:
        payload = jwt.decode(
            refresh_cookie, get_settings().secret_key, algorithms=[ALGORITHM]
        )
    except jwt.PyJWTError as err:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from err
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    jti = payload.get("jti")
    user_id = payload.get("sub")
    if not isinstance(jti, str) or not isinstance(user_id, str):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    row = await session.get(RefreshToken, jti)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if row.revoked_at is not None:
        await _revoke_all_refresh_tokens_for(user_id, session)
        await session.execute(
            update(User)
            .where(User.user_id == user_id)
            .values(token_version=User.token_version + 1)
        )
        await session.commit()
        clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token reused")

    if row.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=401, detail="Refresh token expired")

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    await _issue_session(user, response, session, replaces_jti=jti)
    await session.commit()


@router.post(
    "/logout",
    status_code=204,
    operation_id="logout",
    summary="Invalidate all tokens for the current user",
)
async def logout(current_user: CurrentUserDep, session: SessionDep, response: Response):
    current_user.token_version += 1
    session.add(current_user)
    await _revoke_all_refresh_tokens_for(current_user.user_id, session)
    await session.commit()
    clear_session_cookies(response)


async def _revoke_all_refresh_tokens_for(user_id: str, session: SessionDep) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )

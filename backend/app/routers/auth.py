import uuid

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.auth import create_access_token
from app.config import get_settings
from app.dependencies import CurrentUserDep, SessionDep
from app.models import User
from app.rate_limit import limiter
from app.schemas import LoginIn, TokenOut, UserCreate, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

_ph = PasswordHasher()
# dummy hash so unknown email still pays verify cost
# blocks user enum via response timing
_DUMMY_HASH = _ph.hash("dummy-password-for-timing-equalization")


def _hash_password(password: str) -> str:
    return _ph.hash(password)


@router.post(
    "/register",
    response_model=UserOut,
    status_code=201,
    operation_id="registerUser",
    summary="Register a new user",
)
@limiter.limit(lambda: get_settings().rate_limit_register)
async def register(request: Request, body: UserCreate, session: SessionDep):
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
    "/login",
    response_model=TokenOut,
    operation_id="login",
    summary="Log in and obtain an access token",
)
@limiter.limit(lambda: get_settings().rate_limit_login)
async def login(request: Request, body: LoginIn, session: SessionDep):
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


@router.post(
    "/logout",
    status_code=204,
    operation_id="logout",
    summary="Invalidate all tokens for the current user",
)
async def logout(current_user: CurrentUserDep, session: SessionDep):
    current_user.token_version += 1
    session.add(current_user)
    await session.commit()

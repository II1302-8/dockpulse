import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import APIKeyCookie
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models import RefreshToken, User

ALGORITHM = "HS256"

ACCESS_COOKIE = "dockpulse_access"
REFRESH_COOKIE = "dockpulse_refresh"
CSRF_COOKIE = "dockpulse_csrf"
CSRF_HEADER = "X-CSRF-Token"

# auto_error=False so we control the 401 message and detail uniformly
_cookie_scheme = APIKeyCookie(name=ACCESS_COOKIE, auto_error=False)
_logger = logging.getLogger(__name__)


def _access_ttl() -> timedelta:
    return timedelta(minutes=get_settings().access_token_ttl_minutes)


def _refresh_ttl() -> timedelta:
    return timedelta(days=get_settings().refresh_token_ttl_days)


def create_access_token(user: User, expires_in: timedelta | None = None) -> str:
    ttl = expires_in or _access_ttl()
    payload = {
        "sub": user.user_id,
        "ver": user.token_version,
        "exp": datetime.now(UTC) + ttl,
        "type": "access",
    }
    return jwt.encode(payload, get_settings().secret_key, algorithm=ALGORITHM)


async def create_refresh_token(
    user: User,
    session: AsyncSession,
    *,
    replaces_jti: str | None = None,
) -> tuple[str, datetime]:
    jti = uuid.uuid4().hex
    now = datetime.now(UTC)
    expires_at = now + _refresh_ttl()
    session.add(
        RefreshToken(
            jti=jti,
            user_id=user.user_id,
            issued_at=now,
            expires_at=expires_at,
            replaced_by_jti=None,
        )
    )
    if replaces_jti is not None:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.jti == replaces_jti)
            .values(revoked_at=now, replaced_by_jti=jti)
        )
    payload = {
        "sub": user.user_id,
        "jti": jti,
        "exp": expires_at,
        "type": "refresh",
    }
    token = jwt.encode(payload, get_settings().secret_key, algorithm=ALGORITHM)
    return token, expires_at


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_session_cookies(
    response: Response,
    *,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
) -> None:
    settings = get_settings()
    secure = settings.cookies_require_https
    domain = settings.cookie_domain
    common = {
        "secure": secure,
        "samesite": "lax",
        "domain": domain,
        "path": "/",
    }
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        httponly=True,
        max_age=int(_access_ttl().total_seconds()),
        **common,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        httponly=True,
        max_age=int(_refresh_ttl().total_seconds()),
        **common,
    )
    # csrf cookie must be js-readable for the double-submit echo
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        httponly=False,
        max_age=int(_refresh_ttl().total_seconds()),
        **common,
    )


def clear_session_cookies(response: Response) -> None:
    settings = get_settings()
    common = {
        "secure": settings.cookies_require_https,
        "samesite": "lax",
        "domain": settings.cookie_domain,
        "path": "/",
    }
    response.delete_cookie(ACCESS_COOKIE, **common)
    response.delete_cookie(REFRESH_COOKIE, **common)
    response.delete_cookie(CSRF_COOKIE, **common)


def _decode_access(token: str) -> dict:
    try:
        payload = jwt.decode(
            token, get_settings().secret_key, algorithms=[ALGORITHM]
        )
    except jwt.PyJWTError as err:
        raise HTTPException(
            status_code=401, detail="Invalid or expired token"
        ) from err
    if payload.get("type") not in (None, "access"):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


async def get_current_user(
    session: Annotated[AsyncSession, Depends(get_session)],
    cookie_token: Annotated[str | None, Depends(_cookie_scheme)] = None,
) -> User:
    if not cookie_token:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    payload = _decode_access(cookie_token)
    try:
        user_id: str = payload["sub"]
        token_version: int = payload["ver"]
    except KeyError as err:
        raise HTTPException(
            status_code=401, detail="Invalid or expired token"
        ) from err

    user = await session.get(User, user_id)
    if user is None or user.token_version != token_version:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


async def require_csrf(request: Request) -> None:
    # raw header/cookie reads so this dep doesn't pollute openapi parameters
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    csrf_cookie = request.cookies.get(CSRF_COOKIE)
    # anonymous flows like /login arrive without the cookie, no token to compare
    if csrf_cookie is None:
        return
    csrf_header = request.headers.get(CSRF_HEADER)
    if csrf_header is None or not secrets.compare_digest(csrf_header, csrf_cookie):
        raise HTTPException(status_code=403, detail="CSRF token mismatch")

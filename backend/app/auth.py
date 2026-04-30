from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models import User

ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(hours=1)

_bearer = HTTPBearer()


def create_access_token(user: User, expires_in: timedelta = ACCESS_TOKEN_TTL) -> str:
    payload = {
        "sub": user.user_id,
        "ver": user.token_version,
        "exp": datetime.now(UTC) + expires_in,
    }
    return jwt.encode(payload, get_settings().secret_key, algorithm=ALGORITHM)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    try:
        payload = jwt.decode(
            credentials.credentials,
            get_settings().secret_key,
            algorithms=[ALGORITHM],
        )
        user_id: str = payload["sub"]
        token_version: int = payload["ver"]
    except (jwt.PyJWTError, KeyError) as err:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from err

    user = await session.get(User, user_id)
    if user is None or user.token_version != token_version:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user

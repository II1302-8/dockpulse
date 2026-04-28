import os
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User

ALGORITHM = "HS256"

_bearer = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    secret = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
    try:
        payload = jwt.decode(credentials.credentials, secret, algorithms=[ALGORITHM])
        user_id: str = payload["sub"]
    except (jwt.PyJWTError, KeyError) as err:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from err

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import User

SessionDep = Annotated[AsyncSession, Depends(get_session)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def _require_harbormaster(user: CurrentUserDep) -> User:
    if user.role != "harbormaster":
        raise HTTPException(status_code=403, detail="Harbormaster role required")
    return user


HarbormasterDep = Annotated[User, Depends(_require_harbormaster)]

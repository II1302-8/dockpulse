from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import User
from app.schemas import UserOut, UserPatch

router = APIRouter(prefix="/api/users", tags=["users"])
currentuser_dep = Annotated[User, Depends(get_current_user)]
sessiondep = Annotated[AsyncSession, Depends(get_session)]


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


@router.get("/me", response_model=UserOut, operation_id="getMe")
async def get_me(current_user: currentuser_dep):
    return current_user


@router.patch("/me", response_model=UserOut, operation_id="updateMe")
async def update_me(
    body: UserPatch, current_user: currentuser_dep, session: sessiondep
):
    if body.email and body.email != current_user.email:
        existing = await session.execute(select(User).where(User.email == body.email))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Email already in use")

    for field in ("firstname", "lastname", "email", "phone", "boat_club"):
        value = getattr(body, field)
        if value is not None:
            setattr(current_user, field, value)

    if body.password is not None:
        current_user.password_hash = _hash_password(body.password)

    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user

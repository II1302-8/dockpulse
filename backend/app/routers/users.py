import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    authenticate_user,
    create_access_token,
    get_current_user,
    get_password_hash,
)
from app.db import get_session
from app.models import Users
from app.schemas import Token, User, UserCreate

router = APIRouter(prefix="/api/users", tags=["users"])
sessiondep = Annotated[AsyncSession, Depends(get_session)]


@router.post("", response_model=User, status_code=201)
async def create_user(
    user: UserCreate, db: Annotated[AsyncSession, Depends(get_session)]
):
    result = await db.execute(
        select(Users).where(func.lower(Users.email) == user.email.lower())
    )
    existing_email = result.scalars().first()

    if existing_email:
        return {"email": existing_email}
        # raise HTTPException(
        #    status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists"
        # )
    myuuid = uuid.uuid4()
    new_user = Users(
        user_id=str(myuuid),
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email.lower(),
        telephone=user.telephone,
        hashed_password=get_password_hash(user.password),
    )
    db.add(new_user)  # stages the insert
    await db.commit()  # commits
    await db.refresh(
        new_user
    )  # refreshar databasen, ej nödvändig eftersom sql-alchemy redan gör det

    return new_user


@router.post("/token")
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    user = authenticate_user(form_data.username, form_data.password, sessiondep)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me/")
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user

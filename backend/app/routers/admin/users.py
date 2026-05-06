"""user crud + harbormaster harbor-grants"""

import uuid
from typing import Annotated, Literal

from argon2 import PasswordHasher
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, SecretStr
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import SessionDep
from app.models import Harbor, User, UserHarborRole
from app.routers.admin._deps import password_hasher

PasswordHasherDep = Annotated[PasswordHasher, Depends(password_hasher)]

router = APIRouter()


class UserCreate(BaseModel):
    email: EmailStr
    password: SecretStr = Field(min_length=8, max_length=128)
    firstname: str = Field(min_length=1, max_length=64)
    lastname: str = Field(min_length=1, max_length=64)
    role: Literal["harbormaster", "boat_owner"] = "boat_owner"
    phone: str | None = Field(default=None, max_length=32)
    boat_club: str | None = Field(default=None, max_length=128)


class UserPatch(BaseModel):
    role: Literal["harbormaster", "boat_owner"] | None = None
    firstname: str | None = Field(default=None, min_length=1, max_length=64)
    lastname: str | None = Field(default=None, min_length=1, max_length=64)
    phone: str | None = Field(default=None, max_length=32)
    boat_club: str | None = Field(default=None, max_length=128)


class HarborGrant(BaseModel):
    harbor_id: str = Field(min_length=1, max_length=64)


class UserAdminOut(BaseModel):
    user_id: str
    email: str
    firstname: str
    lastname: str
    role: str = Field(examples=["harbormaster"])
    phone: str | None = None
    boat_club: str | None = None


class UserCreatedOut(BaseModel):
    user_id: str
    email: str
    role: str


class UserPatchOut(BaseModel):
    user_id: str
    email: str
    role: str


class HarborGrantOut(BaseModel):
    harbor_id: str
    role: str


class GrantResultOut(BaseModel):
    user_id: str
    harbor_id: str
    noop: bool


@router.get(
    "/users",
    response_model=list[UserAdminOut],
    operation_id="adminListUsers",
)
async def list_users(session: SessionDep) -> list[dict]:
    rows = (await session.execute(select(User).order_by(User.email))).scalars().all()
    return [
        {
            "user_id": u.user_id,
            "email": u.email,
            "firstname": u.firstname,
            "lastname": u.lastname,
            "role": u.role,
            "phone": u.phone,
            "boat_club": u.boat_club,
        }
        for u in rows
    ]


@router.post(
    "/users",
    response_model=UserCreatedOut,
    operation_id="adminCreateUser",
    status_code=201,
)
async def create_user(
    body: UserCreate,
    session: SessionDep,
    ph: PasswordHasherDep,
) -> dict:
    existing = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=409, detail=f"Email {body.email} already in use"
        )
    u = User(
        user_id=str(uuid.uuid4()),
        email=str(body.email),
        firstname=body.firstname,
        lastname=body.lastname,
        password_hash=ph.hash(body.password.get_secret_value()),
        role=body.role,
        phone=body.phone,
        boat_club=body.boat_club,
    )
    session.add(u)
    await session.commit()
    return {"user_id": u.user_id, "email": u.email, "role": u.role}


@router.patch(
    "/users/{user_id}",
    response_model=UserPatchOut,
    operation_id="adminPatchUser",
)
async def patch_user(user_id: str, body: UserPatch, session: SessionDep) -> dict:
    u = await session.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    for field in ("role", "firstname", "lastname", "phone", "boat_club"):
        v = getattr(body, field)
        if v is not None:
            setattr(u, field, v)
    await session.commit()
    return {"user_id": u.user_id, "email": u.email, "role": u.role}


@router.delete("/users/{user_id}", operation_id="adminDeleteUser", status_code=204)
async def delete_user(user_id: str, session: SessionDep) -> None:
    u = await session.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        await session.delete(u)
        await session.commit()
    except IntegrityError as err:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "User has dependent rows that block delete "
                "(assignments, adoption history)"
            ),
        ) from err


@router.get(
    "/users/{user_id}/harbor-grants",
    response_model=list[HarborGrantOut],
    operation_id="adminListUserGrants",
)
async def list_user_grants(user_id: str, session: SessionDep) -> list[dict]:
    if await session.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    rows = (
        (
            await session.execute(
                select(UserHarborRole).where(UserHarborRole.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    return [{"harbor_id": r.harbor_id, "role": r.role} for r in rows]


@router.post(
    "/users/{user_id}/harbor-grants",
    response_model=GrantResultOut,
    operation_id="adminGrantHarbor",
    status_code=201,
)
async def grant_harbor(user_id: str, body: HarborGrant, session: SessionDep) -> dict:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "harbormaster":
        raise HTTPException(
            status_code=409,
            detail=f"User has role {user.role!r}; promote to harbormaster first",
        )
    if await session.get(Harbor, body.harbor_id) is None:
        raise HTTPException(
            status_code=404, detail=f"Harbor {body.harbor_id} not found"
        )
    existing = (
        await session.execute(
            select(UserHarborRole).where(
                UserHarborRole.user_id == user_id,
                UserHarborRole.harbor_id == body.harbor_id,
                UserHarborRole.role == "harbormaster",
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return {"user_id": user_id, "harbor_id": body.harbor_id, "noop": True}
    session.add(
        UserHarborRole(user_id=user_id, harbor_id=body.harbor_id, role="harbormaster")
    )
    await session.commit()
    return {"user_id": user_id, "harbor_id": body.harbor_id, "noop": False}


@router.delete(
    "/users/{user_id}/harbor-grants/{harbor_id}",
    operation_id="adminRevokeHarbor",
    status_code=204,
)
async def revoke_harbor(user_id: str, harbor_id: str, session: SessionDep) -> None:
    row = (
        await session.execute(
            select(UserHarborRole).where(
                UserHarborRole.user_id == user_id,
                UserHarborRole.harbor_id == harbor_id,
                UserHarborRole.role == "harbormaster",
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Grant not found")
    await session.delete(row)
    await session.commit()

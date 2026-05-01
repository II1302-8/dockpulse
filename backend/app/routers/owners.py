from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.future import select

from app.db import DbSession
from app.models import Owner
from app.schemas import OwnerCreate, OwnerResponse, OwnerUpdate

router = APIRouter(prefix="/owners", tags=["owners"])


@router.post("/", response_model=OwnerResponse, status_code=status.HTTP_201_CREATED)
async def create_owner(owner: OwnerCreate, db: DbSession):
    new_owner = Owner(**owner.model_dump())
    db.add(new_owner)
    try:
        await db.commit()
        await db.refresh(new_owner)
        return new_owner
    except IntegrityError as err:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Email or Boat Registration Number already registered",
        ) from err


@router.get("/", response_model=list[OwnerResponse])
async def list_owners(db: DbSession, skip: int = 0, limit: int = 100):
    result = await db.execute(select(Owner).offset(skip).limit(limit))
    return result.scalars().all()


@router.get("/{owner_id}", response_model=OwnerResponse)
async def get_owner(owner_id: int, db: DbSession):
    result = await db.execute(select(Owner).filter(Owner.id == owner_id))
    owner = result.scalars().first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    return owner


@router.put("/{owner_id}", response_model=OwnerResponse)
async def update_owner(owner_id: int, owner_update: OwnerUpdate, db: DbSession):
    result = await db.execute(select(Owner).filter(Owner.id == owner_id))
    db_owner = result.scalars().first()
    if not db_owner:
        raise HTTPException(status_code=404, detail="Owner not found")

    update_data = owner_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_owner, key, value)

    try:
        await db.commit()
        await db.refresh(db_owner)
        return db_owner
    except IntegrityError as err:
        await db.rollback()
        raise HTTPException(
            status_code=400, detail="Email or Registration conflict"
        ) from err


@router.delete("/{owner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_owner(owner_id: int, db: DbSession):
    result = await db.execute(select(Owner).filter(Owner.id == owner_id))
    db_owner = result.scalars().first()
    if not db_owner:
        raise HTTPException(status_code=404, detail="Owner not found")

    await db.delete(db_owner)
    await db.commit()
    return None

"""factory-flashed device registry

tools/factory-flash.py POSTs here after writing OOB + claim_jti to the
device. backend looks up uuid+oob by serial during adoption so the QR
can carry only serial+jti+exp and stay small enough for a 25mm sticker.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import SessionDep
from app.models import FactoryDevice

router = APIRouter()

# expiring-soon window matches tools/factory_flash_helpers.EXPIRY_WARN_DAYS
_EXPIRING_SOON_DAYS = 30


class FactoryDeviceIn(BaseModel):
    serial_number: str = Field(min_length=1, max_length=64)
    mesh_uuid: str = Field(min_length=32, max_length=32, pattern="^[0-9a-f]{32}$")
    oob_hex: str = Field(min_length=32, max_length=32, pattern="^[0-9a-f]{32}$")
    claim_jti: str = Field(min_length=36, max_length=36)
    claim_exp: int = Field(gt=0, description="unix seconds")


class FactoryDeviceOut(BaseModel):
    serial_number: str
    registered_at: datetime


class FactoryDeviceRowOut(BaseModel):
    serial_number: str
    mesh_uuid: str
    claim_jti: str
    claim_exp: datetime
    registered_at: datetime


ExpiryBucket = Literal["all", "expired", "expiring_soon", "healthy"]


@router.put(
    "/factory-devices/{serial}",
    response_model=FactoryDeviceOut,
    operation_id="adminUpsertFactoryDevice",
    status_code=200,
    summary="Register or update a factory-flashed device",
)
async def upsert_factory_device(
    serial: str, body: FactoryDeviceIn, session: SessionDep
) -> dict:
    if serial != body.serial_number:
        raise HTTPException(
            status_code=400, detail="path serial must match body.serial_number"
        )
    now = datetime.now(UTC)
    exp = datetime.fromtimestamp(body.claim_exp, tz=UTC)
    existing = await session.get(FactoryDevice, serial)
    if existing is None:
        device = FactoryDevice(
            serial_number=serial,
            mesh_uuid=body.mesh_uuid,
            oob_hex=body.oob_hex,
            claim_jti=body.claim_jti,
            claim_exp=exp,
            registered_at=now,
        )
        session.add(device)
    else:
        # re-roll: jti rotates, uuid stays (MAC-derived, stable)
        existing.mesh_uuid = body.mesh_uuid
        existing.oob_hex = body.oob_hex
        existing.claim_jti = body.claim_jti
        existing.claim_exp = exp
        existing.registered_at = now
        device = existing
    try:
        await session.commit()
    except IntegrityError as err:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail=f"factory device conflict: {err}"
        ) from err
    return {
        "serial_number": device.serial_number,
        "registered_at": device.registered_at,
    }


@router.get(
    "/factory-devices",
    response_model=list[FactoryDeviceRowOut],
    operation_id="adminListFactoryDevices",
    summary="List factory-registered devices, filterable by claim expiry",
)
async def list_factory_devices(
    session: SessionDep,
    expiry: Annotated[
        ExpiryBucket,
        Query(description="claim_exp bucket: all / expired / expiring_soon / healthy"),
    ] = "all",
) -> list[FactoryDevice]:
    now = datetime.now(UTC)
    soon = now + timedelta(days=_EXPIRING_SOON_DAYS)
    stmt = select(FactoryDevice).order_by(FactoryDevice.claim_exp.asc())
    if expiry == "expired":
        stmt = stmt.where(FactoryDevice.claim_exp <= now)
    elif expiry == "expiring_soon":
        stmt = stmt.where(
            FactoryDevice.claim_exp > now, FactoryDevice.claim_exp <= soon
        )
    elif expiry == "healthy":
        stmt = stmt.where(FactoryDevice.claim_exp > soon)
    rows = (await session.execute(stmt)).scalars().all()
    return list(rows)


@router.delete(
    "/factory-devices/{serial}",
    operation_id="adminDeleteFactoryDevice",
    status_code=204,
    summary="Revoke a factory-registered device (invalidates the sticker)",
)
async def delete_factory_device(serial: str, session: SessionDep) -> None:
    device = await session.get(FactoryDevice, serial)
    if device is None:
        raise HTTPException(status_code=404, detail="factory device not found")
    await session.delete(device)
    await session.commit()

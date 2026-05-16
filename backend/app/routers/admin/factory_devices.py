"""factory-flashed device registry

tools/factory-flash.py POSTs here after writing OOB + claim_jti to the
device. backend looks up uuid+oob by serial during adoption so the QR
can carry only serial+jti+exp and stay small enough for a 25mm sticker.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from app.dependencies import SessionDep
from app.models import FactoryDevice

router = APIRouter()


class FactoryDeviceIn(BaseModel):
    serial_number: str = Field(min_length=1, max_length=64)
    mesh_uuid: str = Field(min_length=32, max_length=32, pattern="^[0-9a-f]{32}$")
    oob_hex: str = Field(min_length=32, max_length=32, pattern="^[0-9a-f]{32}$")
    claim_jti: str = Field(min_length=36, max_length=36)
    claim_exp: int = Field(gt=0, description="unix seconds")


class FactoryDeviceOut(BaseModel):
    serial_number: str
    registered_at: datetime


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

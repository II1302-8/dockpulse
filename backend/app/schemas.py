from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    # Something about this being better for pydantic


class BerthOut(_Base):  # Grundläggande begränsningar
    berth_id: str
    dock_id: str
    label: str | None = None
    length_m: float | None = None
    width_m: float | None = None
    depth_m: float | None = None
    status: str
    sensor_raw: int | None = None
    battery_pct: int | None = None
    last_updated: datetime | None = None


class DockOut(_Base):
    dock_id: str
    harbor_id: str
    name: str


class DockWithBerthsOut(_Base):
    dock_id: str
    harbor_id: str
    name: str
    berths: list[BerthOut] = []


class UserOut(_Base):
    user_id: str
    firstname: str
    lastname: str
    email: str
    phone: str | None = None
    boat_club: str | None = None
    role: Literal["harbormaster", "boat_owner"]


class UserPatch(BaseModel):
    firstname: str | None = None
    lastname: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    boat_club: str | None = None
    password: str | None = None


class UserCreate(BaseModel):
    firstname: str = Field(min_length=1)
    lastname: str = Field(min_length=1)
    email: EmailStr
    phone: str | None = None
    boat_club: str | None = None
    password: str = Field(min_length=8)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class BerthUpdateEvent(BaseModel):
    type: Literal["berth.update"] = "berth.update"
    berth: BerthOut


class GatewayOut(_Base):
    gateway_id: str
    dock_id: str
    name: str
    status: Literal["online", "offline"]
    last_seen: datetime | None = None


class NodeOut(_Base):
    node_id: str
    mesh_uuid: str
    serial_number: str
    berth_id: str
    gateway_id: str
    mesh_unicast_addr: str
    status: Literal["provisioned", "offline", "decommissioned"]
    adopted_at: datetime


class AdoptionRequestOut(_Base):
    request_id: str
    mesh_uuid: str
    serial_number: str
    gateway_id: str
    berth_id: str
    status: Literal["pending", "ok", "err"]
    error_code: str | None = None
    error_msg: str | None = None
    mesh_unicast_addr: str | None = None
    expires_at: datetime
    created_at: datetime
    completed_at: datetime | None = None


class AdoptIn(BaseModel):
    qr_payload: str = Field(
        description="Base64url-encoded JSON from QR fragment (uuid, oob, sn, jwt)"
    )
    berth_id: str
    gateway_id: str


class OwnerBase(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    boat_name: str | None = None
    boat_registration_number: str | None = None


class OwnerCreate(OwnerBase):
    pass


class OwnerUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    boat_name: str | None = None
    boat_registration_number: str | None = None


class OwnerResponse(OwnerBase):
    id: int

    # Allows Pydantic to read the data even if it's not a dict (like a SQLAlchemy model)
    model_config = ConfigDict(from_attributes=True)

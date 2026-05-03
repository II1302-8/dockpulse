from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr


class _BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AssignmentOut(_BaseSchema):
    berth_id: str
    user_id: str


class BerthOut(_BaseSchema):
    berth_id: str
    dock_id: str
    label: str | None = None
    length_m: float | None = None
    width_m: float | None = None
    depth_m: float | None = None
    status: str
    is_reserved: bool = False
    sensor_raw: int | None = None
    battery_pct: int | None = None
    last_updated: datetime | None = None
    assignment: AssignmentOut | None = None


class AssignBerthIn(BaseModel):
    user_id: str = Field(min_length=1)


class DockOut(_BaseSchema):
    dock_id: str
    harbor_id: str
    name: str


class DockWithBerthsOut(_BaseSchema):
    dock_id: str
    harbor_id: str
    name: str
    berths: list[BerthOut] = []


class UserOut(_BaseSchema):
    user_id: str
    firstname: str
    lastname: str
    email: str
    phone: str | None = None
    boat_club: str | None = None
    role: Literal["harbormaster", "boat_owner"]


_NAME_FIELD = dict(min_length=1, max_length=100, pattern=r"^[A-Za-zÀ-ÖØ-öø-ÿ' \-]+$")
_PHONE_FIELD = dict(pattern=r"^\+?[\d\s\-().]{7,20}$")
_PASSWORD_FIELD = dict(min_length=8, max_length=128)


class UserPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    firstname: str | None = Field(default=None, **_NAME_FIELD)
    lastname: str | None = Field(default=None, **_NAME_FIELD)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, **_PHONE_FIELD)
    boat_club: str | None = Field(default=None, max_length=100)
    password: SecretStr | None = Field(default=None, **_PASSWORD_FIELD)


class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    firstname: str = Field(**_NAME_FIELD)
    lastname: str = Field(**_NAME_FIELD)
    email: EmailStr
    phone: str | None = Field(default=None, **_PHONE_FIELD)
    boat_club: str | None = Field(default=None, max_length=100)
    password: SecretStr = Field(**_PASSWORD_FIELD)


class LoginIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: SecretStr = Field(**_PASSWORD_FIELD)


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class HealthStatus(BaseModel):
    status: Literal["ok", "degraded"]
    uptime: float
    database: Literal["ok", "error"]
    mqtt: Literal["ok", "error"]


class BerthUpdateEvent(BaseModel):
    type: Literal["berth.update"] = "berth.update"
    berth: BerthOut


class GatewayOut(_BaseSchema):
    gateway_id: str
    dock_id: str
    name: str
    status: Literal["online", "offline"]
    last_seen: datetime | None = None


class NodeOut(_BaseSchema):
    node_id: str
    mesh_uuid: str
    serial_number: str
    berth_id: str
    gateway_id: str
    mesh_unicast_addr: str
    status: Literal["provisioned", "offline", "decommissioned"]
    adopted_at: datetime


class AdoptionRequestOut(_BaseSchema):
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


class AdoptionUpdateEvent(BaseModel):
    type: Literal["adoption.update"] = "adoption.update"
    request: AdoptionRequestOut

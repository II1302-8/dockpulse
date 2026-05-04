import os
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr

# read APP_ENV directly instead of via Settings to dodge import-time SECRET_KEY requirement
_APP_ENV = os.getenv("APP_ENV", "dev")


class _BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- enums (mirror the postgres enums declared in models.py) ---

Role = Literal["harbormaster", "boat_owner"]
BerthStatus = Literal["free", "occupied"]
GatewayStatus = Literal["online", "offline"]
# lifecycle state stored on the node row itself
NodeStatus = Literal["provisioned", "offline", "decommissioned"]
# computed liveness view derived from heartbeat freshness, distinct from NodeStatus
NodeHealth = Literal["online", "stale", "offline", "decommissioned"]
AdoptionStatus = Literal["pending", "ok", "err"]
EventType = Literal["occupied", "freed", "alert_unauthorized", "heartbeat"]


# --- shared input field annotations ---

# examples surface in /docs and feed Prism mock so generated payloads pass validation

# \p{L} unicode letter \p{M} combining marks
_NAME = Field(
    min_length=1,
    max_length=100,
    pattern=r"^[\p{L}\p{M}'’ .\-]+$",
    examples=["Alex"],
)
# 7 to 15 digits E.164 separators not counted
_PHONE = Field(
    max_length=20,
    pattern=r"^\+?(?:[\s\-().]*\d){7,15}[\s\-().]*$",
    examples=["+46 70 123 45 67"],
)
# prod gets 12 char floor per nist 800-63b rev 4 / owasp asvs 5, dev/staging relaxed for testing
_PASSWORD_MIN = 12 if _APP_ENV == "prod" else 4
_PASSWORD = Field(
    min_length=_PASSWORD_MIN,
    max_length=128,
    examples=["correct horse battery staple"],
)
_BOAT_CLUB = Field(max_length=100, examples=["Saltsjöbadens BK"])
_EMAIL = Field(examples=["alex@example.com"])

Name = Annotated[str, _NAME]
NameOpt = Annotated[str | None, _NAME]
PhoneOpt = Annotated[str | None, _PHONE]
Password = Annotated[SecretStr, _PASSWORD]
PasswordOpt = Annotated[SecretStr | None, _PASSWORD]
BoatClubOpt = Annotated[str | None, _BOAT_CLUB]
EmailField = Annotated[EmailStr, _EMAIL]
EmailFieldOpt = Annotated[EmailStr | None, _EMAIL]


# --- berths / docks / gateways ---


class AssignmentOut(_BaseSchema):
    berth_id: str = Field(examples=["berth-001"])
    user_id: str = Field(examples=["user-001"])


class BerthOut(_BaseSchema):
    berth_id: str = Field(examples=["berth-001"])
    dock_id: str = Field(examples=["dock-a"])
    label: str | None = Field(default=None, examples=["A1"])
    length_m: float | None = Field(default=None, examples=[8.5])
    width_m: float | None = Field(default=None, examples=[3.2])
    depth_m: float | None = Field(default=None, examples=[2.0])
    status: BerthStatus
    is_reserved: bool = False
    sensor_raw: int | None = Field(default=None, examples=[1234])
    battery_pct: int | None = Field(default=None, examples=[87])
    last_updated: datetime | None = Field(
        default=None, examples=["2026-05-03T14:30:00Z"]
    )
    assignment: AssignmentOut | None = None


class AssignBerthIn(BaseModel):
    user_id: str = Field(min_length=1, examples=["user-001"])


class DockOut(_BaseSchema):
    dock_id: str = Field(examples=["dock-a"])
    harbor_id: str = Field(examples=["harbor-saltsjobaden"])
    name: str = Field(examples=["A Pier"])


class DockWithBerthsOut(_BaseSchema):
    dock_id: str = Field(examples=["dock-a"])
    harbor_id: str = Field(examples=["harbor-saltsjobaden"])
    name: str = Field(examples=["A Pier"])
    berths: list[BerthOut] = []


class GatewayOut(_BaseSchema):
    gateway_id: str = Field(examples=["gw-dock-a"])
    dock_id: str = Field(examples=["dock-a"])
    name: str = Field(examples=["Pier A gateway"])
    status: GatewayStatus
    last_seen: datetime | None = Field(
        default=None, examples=["2026-05-03T14:30:00Z"]
    )


# --- nodes / events / adoption ---


class EventOut(_BaseSchema):
    event_id: str = Field(examples=["evt-0001"])
    berth_id: str = Field(examples=["berth-001"])
    node_id: str = Field(examples=["node-012"])
    event_type: EventType
    sensor_raw: int = Field(examples=[1234])
    timestamp: datetime = Field(examples=["2026-05-03T14:30:00Z"])


class NodeOut(_BaseSchema):
    node_id: str = Field(examples=["node-012"])
    mesh_uuid: str = Field(examples=["a1b2c3d4-e5f6-7890-abcd-ef1234567890"])
    serial_number: str = Field(examples=["DP-N-000123"])
    berth_id: str = Field(examples=["berth-001"])
    gateway_id: str = Field(examples=["gw-dock-a"])
    mesh_unicast_addr: str = Field(examples=["0x0042"])
    status: NodeStatus
    adopted_at: datetime = Field(examples=["2026-05-03T14:00:00Z"])


class NodeHealthOut(_BaseSchema):
    node_id: str = Field(examples=["node-012"])
    serial_number: str = Field(examples=["DP-N-000123"])
    berth_id: str = Field(examples=["berth-001"])
    gateway_id: str = Field(examples=["gw-dock-a"])
    mesh_unicast_addr: str = Field(examples=["0x0042"])
    adopted_at: datetime = Field(examples=["2026-05-03T14:00:00Z"])
    health: NodeHealth
    battery_pct: int | None = Field(default=None, examples=[87])
    last_seen: datetime | None = Field(default=None, examples=["2026-05-03T14:30:00Z"])


class NodeDetailOut(NodeHealthOut):
    recent_events: list[EventOut] = []


class AdoptionRequestOut(_BaseSchema):
    request_id: str = Field(examples=["req-0001"])
    mesh_uuid: str = Field(examples=["a1b2c3d4-e5f6-7890-abcd-ef1234567890"])
    serial_number: str = Field(examples=["DP-N-000123"])
    gateway_id: str = Field(examples=["gw-dock-a"])
    berth_id: str = Field(examples=["berth-001"])
    status: AdoptionStatus
    error_code: str | None = Field(default=None, examples=["timeout"])
    error_msg: str | None = Field(default=None, examples=["node did not respond"])
    mesh_unicast_addr: str | None = Field(default=None, examples=["0x0042"])
    expires_at: datetime = Field(examples=["2026-05-03T14:35:00Z"])
    created_at: datetime = Field(examples=["2026-05-03T14:30:00Z"])
    completed_at: datetime | None = Field(
        default=None, examples=["2026-05-03T14:31:00Z"]
    )


class AdoptIn(BaseModel):
    qr_payload: str = Field(
        description="Base64url-encoded JSON from QR fragment (uuid, oob, sn, jwt)"
    )
    berth_id: str = Field(examples=["berth-001"])
    gateway_id: str = Field(examples=["gw-dock-a"])


# --- users / auth ---


class UserOut(_BaseSchema):
    user_id: str = Field(examples=["user-001"])
    firstname: str = Field(examples=["Alex"])
    lastname: str = Field(examples=["Lindgren"])
    email: EmailField
    phone: str | None = Field(default=None, examples=["+46 70 123 45 67"])
    boat_club: str | None = Field(default=None, examples=["Saltsjöbadens BK"])
    role: Role


class UserPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    firstname: NameOpt = None
    lastname: NameOpt = None
    email: EmailFieldOpt = None
    phone: PhoneOpt = None
    boat_club: BoatClubOpt = None
    password: PasswordOpt = None
    # required only when password is being changed, verified server-side
    current_password: SecretStr | None = None


class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    firstname: Name
    lastname: Name
    email: EmailField
    phone: PhoneOpt = None
    boat_club: BoatClubOpt = None
    password: Password


class LoginIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailField
    password: SecretStr


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


# --- system ---


class HealthStatus(BaseModel):
    status: Literal["ok", "degraded"]
    uptime: float = Field(examples=[12345.6])
    database: Literal["ok", "error"]
    mqtt: Literal["ok", "error"]


# --- realtime events ---


class BerthUpdateEvent(BaseModel):
    type: Literal["berth.update"] = "berth.update"
    berth: BerthOut


class AdoptionUpdateEvent(BaseModel):
    type: Literal["adoption.update"] = "adoption.update"
    request: AdoptionRequestOut


# --- notification preferences ---


class NotificationPrefsOut(_BaseSchema):
    notify_arrival: bool
    notify_departure: bool


class NotificationPrefsPatch(BaseModel):
    notify_arrival: bool | None = None
    notify_departure: bool | None = None

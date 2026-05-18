import os
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    SecretStr,
)

# read directly to dodge Settings' import-time SECRET_KEY requirement
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
EventType = Literal[
    "occupied", "freed", "alert_unauthorized", "heartbeat", "assignment_removed"
]
BookingStatus = Literal[
    "confirmed", "cancelled_by_visitor", "cancelled_by_host", "completed"
]
InviteStatus = Literal["pending", "accepted", "expired", "revoked", "rejected"]


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
# non-dev floors per nist 800-63b rev 4; dev relaxed for local testing.
# matches FE which keys on Vite MODE=production (staging is also a prod build)
_PASSWORD_MIN = 4 if _APP_ENV == "dev" else 12
_PASSWORD = Field(
    min_length=_PASSWORD_MIN,
    max_length=128,
    examples=["correct horse battery staple"],
)
_BOAT_CLUB = Field(max_length=100, examples=["Saltsjöbadens BK"])
_EMAIL = Field(examples=["alex@example.com"])


def _lower_email(v: str | None) -> str | None:
    return v.lower() if v else v


# email is case-insensitive per RFC 5321; normalize at the type so every
# schema using EmailField stores a canonical form (lookups, indexes, joins)
_LOWER_EMAIL = AfterValidator(_lower_email)

Name = Annotated[str, _NAME]
NameOpt = Annotated[str | None, _NAME]
PhoneOpt = Annotated[str | None, _PHONE]
Password = Annotated[SecretStr, _PASSWORD]
PasswordOpt = Annotated[SecretStr | None, _PASSWORD]
BoatClubOpt = Annotated[str | None, _BOAT_CLUB]
EmailField = Annotated[EmailStr, _EMAIL, _LOWER_EMAIL]
EmailFieldOpt = Annotated[EmailStr | None, _EMAIL, _LOWER_EMAIL]


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
    # owner-controlled visibility: true when the berth is currently usable by
    # visitors. derived server-side from sensor status + reservation + any
    # availability window covering "now". the FE map / overviews key off this
    is_available_now: bool = True
    sensor_raw: int | None = Field(default=None, examples=[1234])
    battery_pct: int | None = Field(default=None, examples=[87])
    last_updated: datetime | None = Field(
        default=None, examples=["2026-05-03T14:30:00Z"]
    )
    assignment: AssignmentOut | None = None


class AssignBerthIn(BaseModel):
    user_id: str = Field(min_length=1, examples=["user-001"])


class BerthInviteCreate(BaseModel):
    berth_id: str = Field(min_length=1, examples=["berth-001"])
    email: EmailField


class BerthInviteOut(_BaseSchema):
    invite_id: str = Field(examples=["inv-001"])
    berth_id: str = Field(examples=["berth-001"])
    berth_label: str | None = Field(default=None, examples=["A-12"])
    harbor_id: str = Field(examples=["harbor-001"])
    harbor_name: str | None = Field(default=None, examples=["Saltsjöbaden"])
    email: EmailField
    status: InviteStatus
    expires_at: datetime = Field()


class BerthInviteList(_BaseSchema):
    items: list[BerthInviteOut]
    total: int = Field(examples=[42])


class DockOut(_BaseSchema):
    dock_id: str = Field(examples=["dock-a"])
    harbor_id: str = Field(examples=["harbor-saltsjobaden"])
    name: str = Field(examples=["A Pier"])


class DockWithBerthsOut(_BaseSchema):
    dock_id: str = Field(examples=["dock-a"])
    harbor_id: str = Field(examples=["harbor-saltsjobaden"])
    name: str = Field(examples=["A Pier"])
    berths: list[BerthOut] = []


class HarborOut(_BaseSchema):
    harbor_id: str = Field(examples=["harbor-saltsjobaden"])
    name: str = Field(examples=["Saltsjöbaden Marina"])


class GatewayOut(_BaseSchema):
    gateway_id: str = Field(examples=["gw-dock-a"])
    dock_id: str = Field(examples=["dock-a"])
    name: str = Field(examples=["Pier A gateway"])
    status: GatewayStatus
    last_seen: datetime | None = Field(default=None, examples=["2026-05-03T14:30:00Z"])
    provision_ttl_s: int | None = Field(
        default=None,
        examples=[180],
        description="Per-gateway override; null falls back to ADOPTION_TTL",
    )


class PendingGatewayOut(_BaseSchema):
    gateway_id: str = Field(examples=["gw-unregistered"])
    first_seen_at: datetime = Field(examples=["2026-05-06T11:29:00Z"])
    last_seen_at: datetime = Field(examples=["2026-05-06T11:32:00Z"])
    attempts: int = Field(examples=[3])


class BerthAvailabilityWindowOut(_BaseSchema):
    window_id: str = Field(examples=["win-0001"])
    berth_id: str = Field(examples=["berth-001"])
    user_id: str = Field(examples=["user-001"])
    from_date: datetime = Field(examples=["2026-06-01T00:00:00Z"])
    return_date: datetime = Field(examples=["2026-06-08T00:00:00Z"])
    created_at: datetime = Field(examples=["2026-05-05T14:30:00Z"])


class BerthAvailabilityWindowIn(BaseModel):
    from_date: datetime = Field(examples=["2026-06-01T00:00:00Z"])
    return_date: datetime = Field(examples=["2026-06-08T00:00:00Z"])


# --- bookings ---


class BookingCreate(BaseModel):
    from_date: datetime = Field(examples=["2026-06-03T00:00:00Z"])
    to_date: datetime = Field(examples=["2026-06-06T00:00:00Z"])
    boat_length_m: float | None = Field(default=None, ge=0, examples=[8.5])
    boat_width_m: float | None = Field(default=None, ge=0, examples=[3.2])
    boat_depth_m: float | None = Field(default=None, ge=0, examples=[1.4])
    notes: str | None = Field(default=None, max_length=500, examples=["arriving late"])


class BookingCancelIn(BaseModel):
    # host-side cancellations carry a reason; visitors omit it
    reason: str | None = Field(default=None, max_length=500)


class BookingOut(_BaseSchema):
    booking_id: str = Field(examples=["bk-0001"])
    berth_id: str = Field(examples=["berth-001"])
    user_id: str = Field(examples=["user-001"])
    from_date: datetime = Field(examples=["2026-06-03T00:00:00Z"])
    to_date: datetime = Field(examples=["2026-06-06T00:00:00Z"])
    status: BookingStatus
    boat_length_m: float | None = Field(default=None, examples=[8.5])
    boat_width_m: float | None = Field(default=None, examples=[3.2])
    boat_depth_m: float | None = Field(default=None, examples=[1.4])
    notes: str | None = Field(default=None, examples=["arriving late"])
    cancelled_by: str | None = Field(default=None, examples=["user-002"])
    cancelled_at: datetime | None = Field(
        default=None, examples=["2026-06-02T08:00:00Z"]
    )
    cancel_reason: str | None = Field(default=None, examples=["storm"])
    created_at: datetime = Field(examples=["2026-05-13T14:30:00Z"])


class BookingList(_BaseSchema):
    items: list[BookingOut]
    total: int = Field(examples=[42])


class BookableBerthOut(_BaseSchema):
    berth_id: str = Field(examples=["berth-001"])
    dock_id: str = Field(examples=["dock-a"])
    harbor_id: str = Field(examples=["harbor-saltsjobaden"])
    label: str | None = Field(default=None, examples=["A1"])
    length_m: float | None = Field(default=None, examples=[8.5])
    width_m: float | None = Field(default=None, examples=[3.2])
    depth_m: float | None = Field(default=None, examples=[2.0])
    # availability window covering the queried range; the booking attaches here
    window_id: str = Field(examples=["win-0001"])
    window_from: datetime = Field(examples=["2026-06-01T00:00:00Z"])
    window_to: datetime = Field(examples=["2026-06-08T00:00:00Z"])


class BookedRange(_BaseSchema):
    booking_id: str = Field(examples=["bk-0001"])
    from_date: datetime = Field(examples=["2026-06-03T00:00:00Z"])
    to_date: datetime = Field(examples=["2026-06-06T00:00:00Z"])


class BookableWindowOut(_BaseSchema):
    window_id: str = Field(examples=["win-0001"])
    berth_id: str = Field(examples=["berth-001"])
    from_date: datetime = Field(examples=["2026-06-01T00:00:00Z"])
    return_date: datetime = Field(examples=["2026-06-08T00:00:00Z"])
    booked: list[BookedRange] = []


class BookingConflict(_BaseSchema):
    # discriminates 'no covering window' vs 'overlaps existing booking'
    kind: Literal["no_window", "overlap", "dates_invalid"]
    booking_id: str | None = Field(default=None, examples=["bk-0007"])
    from_date: datetime | None = Field(default=None)
    to_date: datetime | None = Field(default=None)


class BookingPreflightIn(BaseModel):
    from_date: datetime = Field(examples=["2026-06-03T00:00:00Z"])
    to_date: datetime = Field(examples=["2026-06-06T00:00:00Z"])


class BookingPreflightOut(_BaseSchema):
    ok: bool
    window_id: str | None = Field(default=None, examples=["win-0001"])
    conflicts: list[BookingConflict] = []


# --- nodes / events / adoption ---


class EventOut(_BaseSchema):
    event_id: str = Field(examples=["evt-0001"])
    berth_id: str = Field(examples=["berth-001"])
    # audit events (e.g. assignment_removed) have no originating node
    node_id: str | None = Field(default=None, examples=["node-012"])
    event_type: EventType
    sensor_raw: int | None = Field(default=None, examples=[1234])
    timestamp: datetime = Field(examples=["2026-05-03T14:30:00Z"])
    actor_user_id: str | None = Field(default=None, examples=["user-001"])
    subject_user_id: str | None = Field(default=None, examples=["user-002"])


class EventList(_BaseSchema):
    items: list[EventOut]
    total: int = Field(examples=[1234])


AlertType = Literal["unauthorized_mooring", "sensor_offline", "low_battery"]


class AlertOut(_BaseSchema):
    alert_id: str = Field(examples=["alrt-0001"])
    berth_id: str = Field(examples=["berth-001"])
    type: AlertType
    message: str = Field(examples=["Battery below 15%"])
    acknowledged: bool = False
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
    # true after a decom where the node didn't ack the Config Node Reset.
    # operator hint to hard-reset the physical device
    mesh_orphan: bool = False


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
    mesh_orphan: bool = False


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
    # 4096 fits real QR (~430 chars) without leaving an authed client a free
    # path to multi-MB JSON parse
    qr_payload: str = Field(
        min_length=1,
        max_length=4096,
        description="Base64url-encoded JSON from QR fragment (uuid, oob, sn, jwt)",
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
    boat_length_m: float | None = Field(default=None, examples=[8.5])
    boat_width_m: float | None = Field(default=None, examples=[3.2])
    boat_depth_m: float | None = Field(default=None, examples=[1.4])
    role: Role
    email_verified: bool = False
    assigned_berth_id: str | None = Field(default=None, examples=["berth-001"])
    # harbormasters: first managed harbor; lets the FE build correct urls
    # without having to map marina-slug → harbor_id on the client
    harbor_id: str | None = Field(default=None, examples=["ksss-saltsjobaden"])


class UserSearchOut(_BaseSchema):
    user_id: str = Field(examples=["user-001"])
    firstname: str = Field(examples=["Alex"])
    lastname: str = Field(examples=["Lindgren"])
    email: EmailField


class UserPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    firstname: NameOpt = None
    lastname: NameOpt = None
    email: EmailFieldOpt = None
    phone: PhoneOpt = None
    boat_club: BoatClubOpt = None
    boat_length_m: float | None = Field(default=None, ge=0)
    boat_width_m: float | None = Field(default=None, ge=0)
    boat_depth_m: float | None = Field(default=None, ge=0)
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


class ResendVerificationIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailField


class VerifyEmailIn(BaseModel):
    token: str = Field(min_length=1, max_length=512)


# --- system ---


class AdoptionPipelineStatus(BaseModel):
    pending: int = Field(examples=[0], description="Pending adoption requests")
    err_last_15min: int = Field(
        examples=[0], description="Failed adoptions in the last 15 minutes"
    )


class HealthStatus(BaseModel):
    status: Literal["ok", "degraded"]
    uptime: float = Field(examples=[12345.6])
    database: Literal["ok", "error"]
    mqtt: Literal["ok", "error"]
    gateways_online: int = Field(examples=[1])
    gateways_total: int = Field(examples=[1])
    adoption: AdoptionPipelineStatus


# --- realtime events ---


class BerthUpdateEvent(BaseModel):
    type: Literal["berth.update"] = "berth.update"
    berth: BerthOut


class BerthSnapshotEvent(BaseModel):
    type: Literal["berth.snapshot"] = "berth.snapshot"
    berths: list[BerthOut]


class AdoptionUpdateEvent(BaseModel):
    type: Literal["adoption.update"] = "adoption.update"
    request: AdoptionRequestOut


class AdoptionStateEvent(BaseModel):
    type: Literal["adoption.state"] = "adoption.state"
    request_id: str
    state: str = Field(
        examples=["link-open"],
        description="Provisioning phase reported by the gateway",
    )


# --- notification preferences ---


class NotificationPrefsOut(_BaseSchema):
    notify_arrival: bool
    notify_departure: bool


class NotificationPrefsPatch(BaseModel):
    notify_arrival: bool | None = None
    notify_departure: bool | None = None


# --- password reset ---


class PasswordResetRequest(_BaseSchema):
    email: EmailField


class PasswordResetConfirm(_BaseSchema):
    token: str
    password: Password
    invite_token: str | None = Field(default=None, max_length=512)


class PasswordResetOut(_BaseSchema):
    message: str
    invite_token: str | None = Field(default=None, max_length=512)


class AccountDeleteIn(BaseModel):
    # re-auth so a stolen cookie or shared browser can't wipe the account
    current_password: SecretStr

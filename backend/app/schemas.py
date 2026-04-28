from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


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


class UserPatch(BaseModel):
    firstname: str | None = None
    lastname: str | None = None
    email: str | None = None
    phone: str | None = None
    boat_club: str | None = None
    password: str | None = None


class BerthUpdateEvent(BaseModel):
    type: Literal["berth.update"] = "berth.update"
    berth: BerthOut

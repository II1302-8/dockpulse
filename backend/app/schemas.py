from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    # Something about this being better for pydantic


class UserBase(_Base):
    first_name: str
    last_name: str
    email: str
    telephone: str
    home_harbor: str | None = None


class User(UserBase):
    user_id: str


class UserCreate(UserBase):
    password: str


class UserInDB(User):
    hashed_password: str


class Token(_Base):
    access_token: str
    token_type: str


class TokenData(_Base):
    user_id: str | None = None


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


class BerthUpdateEvent(BaseModel):
    type: Literal["berth.update"] = "berth.update"
    berth: BerthOut

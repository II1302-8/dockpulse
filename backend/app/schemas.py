from datetime import datetime

from pydantic import BaseModel

"""
class _Base(Basemodel):
    model_config = {"from_attributes": True}
    # Something about this being better for pydantic
"""


class BerthOut(BaseModel):  # Grundläggande begränsningar
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


class DockOut(BaseModel):
    model_config = {"from_attributes": True}
    dock_id: str
    harbor_id: str
    name: str


class DockWithBerthsOut(BaseModel):
    model_config = {"from_attributes": True}
    dock_id: str
    harbor_id: str
    name: str
    berths: list[BerthOut] = []

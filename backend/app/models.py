from datetime import datetime

from sqlalchemy import Boolean, DateTime, Double, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

berth_status_enum = Enum("free", "occupied", name="berth_status")
event_type_enum = Enum(
    "occupied", "freed", "alert_unauthorized", "heartbeat", name="event_type"
)
alert_type_enum = Enum(
    "unauthorized_mooring", "sensor_offline", "low_battery", name="alert_type"
)


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    firstname: Mapped[str] = mapped_column(String, nullable=False)
    lastname: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    phone: Mapped[str | None] = mapped_column(String)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    boat_club: Mapped[str | None] = mapped_column(String)


class Harbor(Base):
    __tablename__ = "harbors"

    harbor_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    lat: Mapped[float | None] = mapped_column(Double)
    lng: Mapped[float | None] = mapped_column(Double)

    docks: Mapped[list["Dock"]] = relationship(back_populates="harbor")


class Dock(Base):
    __tablename__ = "docks"

    dock_id: Mapped[str] = mapped_column(String, primary_key=True)
    harbor_id: Mapped[str] = mapped_column(
        ForeignKey("harbors.harbor_id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)

    harbor: Mapped["Harbor"] = relationship(back_populates="docks")
    berths: Mapped[list["Berth"]] = relationship(back_populates="dock")


class Berth(Base):
    __tablename__ = "berths"

    berth_id: Mapped[str] = mapped_column(String, primary_key=True)
    dock_id: Mapped[str] = mapped_column(ForeignKey("docks.dock_id"), nullable=False)
    label: Mapped[str | None] = mapped_column(String)
    length_m: Mapped[float | None] = mapped_column(Double)
    width_m: Mapped[float | None] = mapped_column(Double)
    depth_m: Mapped[float | None] = mapped_column(Double)
    status: Mapped[str] = mapped_column(berth_status_enum, default="free")
    sensor_raw: Mapped[int | None] = mapped_column(Integer)
    battery_pct: Mapped[int | None] = mapped_column(Integer)
    last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    dock: Mapped["Dock"] = relationship(back_populates="berths")
    events: Mapped[list["Event"]] = relationship(back_populates="berth")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="berth")


class Event(Base):
    __tablename__ = "events"

    event_id: Mapped[str] = mapped_column(String, primary_key=True)
    berth_id: Mapped[str] = mapped_column(ForeignKey("berths.berth_id"), nullable=False)
    node_id: Mapped[str] = mapped_column(String, nullable=False)
    event_type: Mapped[str] = mapped_column(event_type_enum, nullable=False)
    sensor_raw: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    berth: Mapped["Berth"] = relationship(back_populates="events")


class Alert(Base):
    __tablename__ = "alerts"

    alert_id: Mapped[str] = mapped_column(String, primary_key=True)
    berth_id: Mapped[str] = mapped_column(ForeignKey("berths.berth_id"), nullable=False)
    type: Mapped[str] = mapped_column(alert_type_enum, nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    berth: Mapped["Berth"] = relationship(back_populates="alerts")

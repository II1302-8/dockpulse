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
user_role_enum = Enum("harbormaster", "boat_owner", name="user_role")
gateway_status_enum = Enum("online", "offline", name="gateway_status")
node_status_enum = Enum("provisioned", "offline", "decommissioned", name="node_status")
adoption_status_enum = Enum("pending", "ok", "err", name="adoption_status")


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    firstname: Mapped[str] = mapped_column(String, nullable=False)
    lastname: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    phone: Mapped[str | None] = mapped_column(String)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    boat_club: Mapped[str | None] = mapped_column(String)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    role: Mapped[str] = mapped_column(
        user_role_enum, nullable=False, default="boat_owner"
    )


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


class Gateway(Base):
    __tablename__ = "gateways"

    gateway_id: Mapped[str] = mapped_column(String, primary_key=True)
    dock_id: Mapped[str] = mapped_column(
        ForeignKey("docks.dock_id"), nullable=False, unique=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(
        gateway_status_enum, nullable=False, default="offline"
    )
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Node(Base):
    __tablename__ = "nodes"

    node_id: Mapped[str] = mapped_column(String, primary_key=True)
    mesh_uuid: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    serial_number: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    berth_id: Mapped[str] = mapped_column(ForeignKey("berths.berth_id"), nullable=False)
    gateway_id: Mapped[str] = mapped_column(
        ForeignKey("gateways.gateway_id"), nullable=False
    )
    mesh_unicast_addr: Mapped[str] = mapped_column(String, nullable=False)
    dev_key_fp: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(node_status_enum, nullable=False)
    adopted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    adopted_by_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )


class AdoptionRequest(Base):
    __tablename__ = "adoption_requests"

    request_id: Mapped[str] = mapped_column(String, primary_key=True)
    mesh_uuid: Mapped[str] = mapped_column(String, nullable=False)
    serial_number: Mapped[str] = mapped_column(String, nullable=False)
    claim_jti: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    gateway_id: Mapped[str] = mapped_column(
        ForeignKey("gateways.gateway_id"), nullable=False
    )
    berth_id: Mapped[str] = mapped_column(ForeignKey("berths.berth_id"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[str] = mapped_column(
        adoption_status_enum, nullable=False, default="pending"
    )
    error_code: Mapped[str | None] = mapped_column(String)
    error_msg: Mapped[str | None] = mapped_column(String)
    mesh_unicast_addr: Mapped[str | None] = mapped_column(String)
    dev_key_fp: Mapped[str | None] = mapped_column(String)
    created_by_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FactoryKey(Base):
    __tablename__ = "factory_keys"

    key_id: Mapped[str] = mapped_column(String, primary_key=True)
    algorithm: Mapped[str] = mapped_column(String, nullable=False)
    public_key_pem: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Double,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, declarative_mixin, mapped_column, relationship

from app.db import Base


@declarative_mixin
class AuditTimestampsMixin:
    # trigger set_updated_at() is the source of truth, onupdate keeps orm consistent
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


berth_status_enum = Enum("free", "occupied", name="berth_status")
event_type_enum = Enum(
    "occupied", "freed", "alert_unauthorized", "heartbeat", name="event_type"
)
alert_type_enum = Enum(
    "unauthorized_mooring", "sensor_offline", "low_battery", name="alert_type"
)
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
    assignments: Mapped[list["Assignment"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    notification_prefs: Mapped["UserNotificationPrefs | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class BerthAvailabilityWindow(Base):
    __tablename__ = "berth_availability_windows"
    __table_args__ = (
        CheckConstraint(
            "return_date > from_date",
            name="ck_berth_availability_windows_dates",
        ),
    )

    window_id: Mapped[str] = mapped_column(String, primary_key=True)
    berth_id: Mapped[str] = mapped_column(
        ForeignKey("berths.berth_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    return_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Harbor(AuditTimestampsMixin, Base):
    __tablename__ = "harbors"

    harbor_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    lat: Mapped[float | None] = mapped_column(Double)
    lng: Mapped[float | None] = mapped_column(Double)

    docks: Mapped[list["Dock"]] = relationship(back_populates="harbor")


class Dock(AuditTimestampsMixin, Base):
    __tablename__ = "docks"

    dock_id: Mapped[str] = mapped_column(String, primary_key=True)
    harbor_id: Mapped[str] = mapped_column(
        ForeignKey("harbors.harbor_id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)

    harbor: Mapped["Harbor"] = relationship(back_populates="docks")
    berths: Mapped[list["Berth"]] = relationship(back_populates="dock")


class Berth(AuditTimestampsMixin, Base):
    __tablename__ = "berths"
    __table_args__ = (
        Index(
            "uq_berths_dock_id_label",
            "dock_id",
            "label",
            unique=True,
            postgresql_where=text("label IS NOT NULL"),
        ),
        Index("ix_berths_status", "status"),
    )

    berth_id: Mapped[str] = mapped_column(String, primary_key=True)
    dock_id: Mapped[str] = mapped_column(
        ForeignKey("docks.dock_id"), nullable=False, index=True
    )
    label: Mapped[str | None] = mapped_column(String)
    length_m: Mapped[float | None] = mapped_column(Double)
    width_m: Mapped[float | None] = mapped_column(Double)
    depth_m: Mapped[float | None] = mapped_column(Double)
    status: Mapped[str] = mapped_column(berth_status_enum, default="free")
    is_reserved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sensor_raw: Mapped[int | None] = mapped_column(Integer)
    battery_pct: Mapped[int | None] = mapped_column(Integer)
    last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    dock: Mapped["Dock"] = relationship(back_populates="berths")
    events: Mapped[list["Event"]] = relationship(back_populates="berth")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="berth")
    assignment: Mapped["Assignment | None"] = relationship(
        back_populates="berth", uselist=False
    )


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_berth_id_timestamp", "berth_id", text("timestamp DESC")),
    )

    event_id: Mapped[str] = mapped_column(String, primary_key=True)
    berth_id: Mapped[str] = mapped_column(ForeignKey("berths.berth_id"), nullable=False)
    # loose by design: events can predate the Node row during adoption
    node_id: Mapped[str] = mapped_column(String, nullable=False)
    event_type: Mapped[str] = mapped_column(event_type_enum, nullable=False)
    sensor_raw: Mapped[int] = mapped_column(Integer, nullable=False)
    # mesh layer reassigns this on rejoin, kept as a per-event snapshot
    mesh_unicast_addr: Mapped[str] = mapped_column(String, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    berth: Mapped["Berth"] = relationship(back_populates="events")


class Alert(AuditTimestampsMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index(
            "ix_alerts_acknowledged_timestamp",
            "acknowledged",
            text("timestamp DESC"),
        ),
    )

    alert_id: Mapped[str] = mapped_column(String, primary_key=True)
    berth_id: Mapped[str] = mapped_column(
        ForeignKey("berths.berth_id"), nullable=False, index=True
    )
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
    # null = use ADOPTION_TTL default in routers/adoptions.py
    provision_ttl_s: Mapped[int | None] = mapped_column(Integer)


class PendingGateway(Base):
    """gateway_ids seen on MQTT before they have a row in `gateways`.
    populated by _handle_gateway_status; consumed by harbormaster UI / dpcli."""

    __tablename__ = "pending_gateways"

    gateway_id: Mapped[str] = mapped_column(String, primary_key=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class Node(AuditTimestampsMixin, Base):
    __tablename__ = "nodes"
    __table_args__ = (
        # at most one live node per berth, decommissioned rows kept for history
        Index(
            "ix_nodes_berth_active",
            "berth_id",
            unique=True,
            postgresql_where=text("status <> 'decommissioned'"),
        ),
    )

    node_id: Mapped[str] = mapped_column(String, primary_key=True)
    mesh_uuid: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    serial_number: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    berth_id: Mapped[str] = mapped_column(ForeignKey("berths.berth_id"), nullable=False)
    gateway_id: Mapped[str] = mapped_column(
        ForeignKey("gateways.gateway_id"), nullable=False, index=True
    )
    mesh_unicast_addr: Mapped[str] = mapped_column(String, nullable=False)
    dev_key_fp: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(node_status_enum, nullable=False)
    adopted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    adopted_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True
    )


class AdoptionRequest(Base):
    __tablename__ = "adoption_requests"
    __table_args__ = (
        Index(
            "uq_adoption_requests_pending_mesh_gateway",
            "mesh_uuid",
            "gateway_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        # sweeper hot path filters on pending only
        Index(
            "ix_adoption_requests_pending_expires_at",
            "expires_at",
            postgresql_where=text("status = 'pending'"),
        ),
    )

    request_id: Mapped[str] = mapped_column(String, primary_key=True)
    mesh_uuid: Mapped[str] = mapped_column(String, nullable=False)
    serial_number: Mapped[str] = mapped_column(String, nullable=False)
    claim_jti: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    gateway_id: Mapped[str] = mapped_column(
        ForeignKey("gateways.gateway_id"), nullable=False, index=True
    )
    berth_id: Mapped[str] = mapped_column(
        ForeignKey("berths.berth_id"), nullable=False, index=True
    )
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
    created_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserNotificationPrefs(Base):
    __tablename__ = "user_notification_prefs"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True
    )
    notify_arrival: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_departure: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    user: Mapped["User"] = relationship(back_populates="notification_prefs")


class Assignment(Base):
    __tablename__ = "assignments"

    # one assignment per berth; replacing the user updates this row in place
    berth_id: Mapped[str] = mapped_column(
        ForeignKey("berths.berth_id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    berth: Mapped["Berth"] = relationship(back_populates="assignment")
    user: Mapped["User"] = relationship(back_populates="assignments")


class UserHarborRole(Base):
    __tablename__ = "user_harbor_roles"
    __table_args__ = (
        CheckConstraint("role = 'harbormaster'", name="user_harbor_roles_role_check"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    harbor_id: Mapped[str] = mapped_column(
        ForeignKey("harbors.harbor_id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    role: Mapped[str] = mapped_column(String, primary_key=True)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index(
            "ix_refresh_tokens_user_active",
            "user_id",
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )

    jti: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_jti: Mapped[str | None] = mapped_column(
        ForeignKey("refresh_tokens.jti", ondelete="SET NULL")
    )

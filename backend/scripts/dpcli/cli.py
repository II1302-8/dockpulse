import asyncio
import os
import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated

# cli does no JWT but Settings still requires SECRET_KEY pass length validator
os.environ.setdefault("SECRET_KEY", "cli-unused-placeholder-not-for-jwt-signing")

import typer
from argon2 import PasswordHasher
from rich.console import Console
from rich.table import Table
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import get_sessionmaker
from app.models import (
    Alert,
    Assignment,
    Berth,
    Dock,
    Event,
    Gateway,
    Harbor,
    Node,
    PendingGateway,
    User,
    UserHarborRole,
)

app = typer.Typer(help="DockPulse developer CLI")
berth_app = typer.Typer(help="Berth management")
app.add_typer(berth_app, name="berth")
_ph = PasswordHasher()
_console = Console()


# mirror DB enums in app/models.py so bad input fails before hitting Postgres
class EventType(StrEnum):
    occupied = "occupied"
    freed = "freed"
    alert_unauthorized = "alert_unauthorized"
    heartbeat = "heartbeat"


class AlertType(StrEnum):
    unauthorized_mooring = "unauthorized_mooring"
    sensor_offline = "sensor_offline"
    low_battery = "low_battery"


@app.command()
def create_user(
    email: Annotated[str, typer.Option(prompt=True)],
    password: Annotated[
        str, typer.Option(prompt=True, hide_input=True, confirmation_prompt=True)
    ],
    firstname: Annotated[str | None, typer.Option()] = None,
    lastname: Annotated[str | None, typer.Option()] = None,
    phone: Annotated[str | None, typer.Option()] = None,
    boat_club: Annotated[str | None, typer.Option()] = None,
):
    """Register a new user. Use grant-harbor to make them a harbormaster."""
    if firstname is None:
        firstname = typer.prompt("Firstname")
    if lastname is None:
        lastname = typer.prompt("Lastname")
    asyncio.run(_create_user(firstname, lastname, email, password, phone, boat_club))


@app.command()
def list_users():
    """List all users in the database."""
    asyncio.run(_list_users())


@app.command()
def grant_harbor(
    email: Annotated[str, typer.Argument(help="Harbormaster email")],
    harbor_id: Annotated[str, typer.Argument(help="Harbor ID to grant authority over")],
):
    """Grant a harbormaster authority over a harbor."""
    asyncio.run(_grant_harbor(email, harbor_id))


@app.command()
def revoke_harbor(
    email: Annotated[str, typer.Argument(help="Harbormaster email")],
    harbor_id: Annotated[str, typer.Argument(help="Harbor ID to revoke")],
):
    """Revoke a harbormaster's authority over a harbor."""
    asyncio.run(_revoke_harbor(email, harbor_id))


@app.command()
def list_harbors():
    """List all harbors."""
    asyncio.run(_list_harbors())


@app.command()
def list_docks():
    """List all docks."""
    asyncio.run(_list_docks())


@app.command()
def list_berths():
    """List all berths."""
    asyncio.run(_list_berths())


@app.command()
def list_assignments():
    """List all berth assignments."""
    asyncio.run(_list_assignments())


@app.command()
def list_events(
    limit: Annotated[int, typer.Option(help="Max rows to show")] = 50,
):
    """List recent events."""
    asyncio.run(_list_events(limit))


@app.command()
def list_alerts(
    unacked: Annotated[bool, typer.Option(help="Show only unacknowledged")] = False,
):
    """List alerts."""
    asyncio.run(_list_alerts(unacked))


@app.command()
def delete_user(
    email: Annotated[str, typer.Argument(help="Email of user to delete")],
    yes: Annotated[bool, typer.Option("--yes", "-y", help="Skip confirmation")] = False,
):
    """Delete a user from the database."""
    if not yes:
        typer.confirm(f"Delete user {email}?", abort=True)
    asyncio.run(_delete_user(email))


@app.command()
def ack_alert(
    alert_id: Annotated[str, typer.Argument(help="Alert ID to acknowledge")],
):
    """Mark an alert as acknowledged."""
    asyncio.run(_ack_alert(alert_id))


@app.command()
def reset_berth(
    berth_ref: Annotated[str, typer.Argument(help="Berth ID or label")],
    dock: Annotated[
        str | None, typer.Option(help="Dock ID to disambiguate label")
    ] = None,
):
    """Force a berth status back to free."""
    asyncio.run(_reset_berth(berth_ref, dock))


@app.command()
def create_harbor(
    harbor_id: Annotated[str, typer.Argument(help="Stable harbor ID, e.g. 'sthlm-vh'")],
    name: Annotated[str, typer.Option(prompt=True, help="Display name")],
    lat: Annotated[float | None, typer.Option(help="Latitude")] = None,
    lng: Annotated[float | None, typer.Option(help="Longitude")] = None,
):
    """Add a new harbor."""
    asyncio.run(_create_harbor(harbor_id, name, lat, lng))


@app.command()
def create_dock(
    dock_id: Annotated[str, typer.Argument(help="Stable dock ID")],
    harbor_id: Annotated[str, typer.Argument(help="Parent harbor ID")],
    name: Annotated[str, typer.Option(prompt=True, help="Display name")],
):
    """Add a new dock under a harbor."""
    asyncio.run(_create_dock(dock_id, harbor_id, name))


@app.command()
def create_berth(
    dock_id: Annotated[str, typer.Argument(help="Dock ID")],
    label: Annotated[str | None, typer.Option(help="Human-readable label")] = None,
    length: Annotated[float | None, typer.Option(help="Length in metres")] = None,
    width: Annotated[float | None, typer.Option(help="Width in metres")] = None,
    depth: Annotated[float | None, typer.Option(help="Depth in metres")] = None,
):
    """Add a new berth to a dock."""
    asyncio.run(_create_berth(dock_id, label, length, width, depth))


@app.command()
def create_gateway(
    gateway_id: Annotated[
        str, typer.Argument(help="Stable gateway ID matching the ESP32 firmware")
    ],
    dock_id: Annotated[str, typer.Argument(help="Dock this gateway covers")],
    name: Annotated[str, typer.Option(prompt=True, help="Display name")],
):
    """Register a gateway so its MQTT status messages are accepted."""
    asyncio.run(_create_gateway(gateway_id, dock_id, name))


@app.command()
def list_gateways():
    """List all gateways."""
    asyncio.run(_list_gateways())


@app.command()
def list_nodes():
    """List all nodes."""
    asyncio.run(_list_nodes())


@app.command()
def list_pending_gateways():
    """List unknown gateway ids seen on MQTT."""
    asyncio.run(_list_pending_gateways())


@app.command()
def decommission_node(
    node_id: Annotated[str, typer.Argument(help="Node ID to decommission")],
    yes: Annotated[bool, typer.Option("--yes", "-y", help="Skip confirmation")] = False,
):
    """Mark a node as decommissioned (no MQTT publish — DB-only fallback)."""
    if not yes:
        typer.confirm(f"Decommission node {node_id}?", abort=True)
    asyncio.run(_decommission_node(node_id))


@app.command()
def create_event(
    berth_id: Annotated[str, typer.Argument(help="Berth ID")],
    event_type: Annotated[EventType, typer.Argument(help="Event type")],
    sensor_raw: Annotated[int, typer.Option(help="Raw sensor value")] = 0,
    node_id: Annotated[str, typer.Option(help="Node ID")] = "dev",
):
    """Insert a test event row directly."""
    asyncio.run(_create_event(berth_id, event_type, sensor_raw, node_id))


@app.command()
def create_alert(
    berth_id: Annotated[str, typer.Argument(help="Berth ID")],
    alert_type: Annotated[AlertType, typer.Argument(help="Alert type")],
    message: Annotated[str, typer.Option(prompt=True)],
):
    """Insert a test alert row directly."""
    asyncio.run(_create_alert(berth_id, alert_type, message))


@app.command()
def seed_db():
    """Insert a default harbor/dock/berths for local development."""
    asyncio.run(_seed_db())


async def _create_user(
    firstname: str,
    lastname: str,
    email: str,
    password: str,
    phone: str | None,
    boat_club: str | None,
) -> None:
    async with get_sessionmaker()() as session:
        existing = await session.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none() is not None:
            typer.echo(f"Error: {email} is already in use", err=True)
            raise typer.Exit(1)

        user = User(
            user_id=str(uuid.uuid4()),
            firstname=firstname,
            lastname=lastname,
            email=email,
            phone=phone,
            boat_club=boat_club,
            password_hash=_ph.hash(password),
        )
        session.add(user)
        await session.commit()

    typer.echo(f"Created user {email}  (id: {user.user_id})")


async def _create_harbor(
    harbor_id: str, name: str, lat: float | None, lng: float | None
) -> None:
    async with get_sessionmaker()() as session:
        if await session.get(Harbor, harbor_id) is not None:
            typer.echo(f"Error: harbor {harbor_id} already exists", err=True)
            raise typer.Exit(1)
        session.add(Harbor(harbor_id=harbor_id, name=name, lat=lat, lng=lng))
        await session.commit()
    typer.echo(f"Created harbor {harbor_id} ({name})")


async def _create_dock(dock_id: str, harbor_id: str, name: str) -> None:
    async with get_sessionmaker()() as session:
        if await session.get(Harbor, harbor_id) is None:
            typer.echo(f"Error: no harbor with id {harbor_id}", err=True)
            raise typer.Exit(1)
        if await session.get(Dock, dock_id) is not None:
            typer.echo(f"Error: dock {dock_id} already exists", err=True)
            raise typer.Exit(1)
        session.add(Dock(dock_id=dock_id, harbor_id=harbor_id, name=name))
        await session.commit()
    typer.echo(f"Created dock {dock_id} under harbor {harbor_id}")


async def _create_gateway(gateway_id: str, dock_id: str, name: str) -> None:
    async with get_sessionmaker()() as session:
        if await session.get(Dock, dock_id) is None:
            typer.echo(f"Error: no dock with id {dock_id}", err=True)
            raise typer.Exit(1)
        if await session.get(Gateway, gateway_id) is not None:
            typer.echo(f"Error: gateway {gateway_id} already exists", err=True)
            raise typer.Exit(1)
        # dock_id is unique on gateways table (one gateway per dock)
        clash = (
            await session.execute(select(Gateway).where(Gateway.dock_id == dock_id))
        ).scalar_one_or_none()
        if clash is not None:
            typer.echo(
                f"Error: dock {dock_id} already has gateway {clash.gateway_id}",
                err=True,
            )
            raise typer.Exit(1)
        session.add(
            Gateway(gateway_id=gateway_id, dock_id=dock_id, name=name, status="offline")
        )
        # clear any pending row so it doesn't show up in /api/gateways/pending
        pending = await session.get(PendingGateway, gateway_id)
        if pending is not None:
            await session.delete(pending)
        await session.commit()
    typer.echo(
        f"Created gateway {gateway_id} on dock {dock_id} "
        "(status=offline until first MQTT status msg)"
    )


async def _list_gateways() -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(select(Gateway).order_by(Gateway.gateway_id))
        gateways = result.scalars().all()
    table = Table("ID", "Dock", "Name", "Status", "Last Seen")
    for g in gateways:
        table.add_row(
            g.gateway_id,
            g.dock_id,
            g.name,
            g.status,
            g.last_seen.isoformat() if g.last_seen else "",
        )
    _console.print(table)


async def _list_pending_gateways() -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(
            select(PendingGateway).order_by(PendingGateway.last_seen_at.desc())
        )
        rows = result.scalars().all()
    table = Table("ID", "First Seen", "Last Seen", "Attempts")
    for r in rows:
        table.add_row(
            r.gateway_id,
            r.first_seen_at.isoformat(),
            r.last_seen_at.isoformat(),
            str(r.attempts),
        )
    _console.print(table)


async def _list_nodes() -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(select(Node).order_by(Node.node_id))
        nodes = result.scalars().all()
    table = Table("ID", "Berth", "Gateway", "Status", "Adopted At")
    for n in nodes:
        table.add_row(
            n.node_id,
            n.berth_id,
            n.gateway_id,
            n.status,
            n.adopted_at.isoformat() if n.adopted_at else "",
        )
    _console.print(table)


async def _decommission_node(node_id: str) -> None:
    async with get_sessionmaker()() as session:
        node = await session.get(Node, node_id)
        if node is None:
            typer.echo(f"Error: no node with id {node_id}", err=True)
            raise typer.Exit(1)
        if node.status == "decommissioned":
            typer.echo(f"{node_id} already decommissioned")
            return
        node.status = "decommissioned"
        await session.commit()
    typer.echo(
        f"Marked {node_id} decommissioned in DB. "
        "Gateway not notified — use API endpoint or republish from harbormaster UI"
    )


async def _grant_harbor(email: str, harbor_id: str) -> None:
    async with get_sessionmaker()() as session:
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            typer.echo(f"Error: no user with email {email}", err=True)
            raise typer.Exit(1)
        if await session.get(Harbor, harbor_id) is None:
            typer.echo(f"Error: no harbor with id {harbor_id}", err=True)
            raise typer.Exit(1)
        existing = (
            await session.execute(
                select(UserHarborRole).where(
                    UserHarborRole.user_id == user.user_id,
                    UserHarborRole.harbor_id == harbor_id,
                    UserHarborRole.role == "harbormaster",
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            typer.echo(f"{email} already harbormaster for {harbor_id}")
            return
        session.add(
            UserHarborRole(
                user_id=user.user_id, harbor_id=harbor_id, role="harbormaster"
            )
        )
        await session.commit()
    typer.echo(f"Granted {email} harbormaster authority over {harbor_id}")


async def _revoke_harbor(email: str, harbor_id: str) -> None:
    async with get_sessionmaker()() as session:
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            typer.echo(f"Error: no user with email {email}", err=True)
            raise typer.Exit(1)
        row = (
            await session.execute(
                select(UserHarborRole).where(
                    UserHarborRole.user_id == user.user_id,
                    UserHarborRole.harbor_id == harbor_id,
                    UserHarborRole.role == "harbormaster",
                )
            )
        ).scalar_one_or_none()
        if row is None:
            typer.echo(f"{email} is not harbormaster for {harbor_id}")
            return
        await session.delete(row)
        await session.commit()
    typer.echo(f"Revoked {email} harbormaster authority over {harbor_id}")


async def _list_users() -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(select(User).order_by(User.email))
        users = result.scalars().all()
        # one query for all harbormaster ids, no n+1 across the user list
        hm_rows = await session.execute(
            select(UserHarborRole.user_id).where(UserHarborRole.role == "harbormaster")
        )
        harbormaster_ids = set(hm_rows.scalars().all())

    table = Table("ID", "Email", "Name", "Role", "Phone", "Boat Club")
    for u in users:
        role = "harbormaster" if u.user_id in harbormaster_ids else "boat_owner"
        table.add_row(
            u.user_id,
            u.email,
            f"{u.firstname} {u.lastname}",
            role,
            u.phone or "",
            u.boat_club or "",
        )
    _console.print(table)


async def _list_harbors() -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(select(Harbor).order_by(Harbor.name))
        harbors = result.scalars().all()

    table = Table("ID", "Name", "Lat", "Lng")
    for h in harbors:
        table.add_row(h.harbor_id, h.name, str(h.lat or ""), str(h.lng or ""))
    _console.print(table)


async def _list_docks() -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(select(Dock).order_by(Dock.harbor_id, Dock.name))
        docks = result.scalars().all()

    table = Table("ID", "Harbor ID", "Name")
    for d in docks:
        table.add_row(d.dock_id, d.harbor_id, d.name)
    _console.print(table)


async def _list_berths() -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(
            select(Berth)
            .options(selectinload(Berth.assignment))
            .order_by(Berth.dock_id, Berth.berth_id)
        )
        berths = result.scalars().all()

    table = Table("ID", "Dock", "Label", "Status", "Reserved", "Assigned To")
    for b in berths:
        table.add_row(
            b.berth_id,
            b.dock_id,
            b.label or "",
            b.status,
            "yes" if b.is_reserved else "no",
            b.assignment.user_id if b.assignment else "",
        )
    _console.print(table)


@berth_app.command("assign")
def berth_assign(
    email: Annotated[str, typer.Argument(help="User email")],
    berth_ref: Annotated[str, typer.Argument(help="Berth ID or label")],
    dock: Annotated[
        str | None, typer.Option(help="Dock ID to disambiguate label")
    ] = None,
):
    """Assign a berth to a user (replaces any existing assignment)."""
    asyncio.run(_berth_assign(email, berth_ref, dock))


@berth_app.command("reserve")
def berth_reserve(
    berth_ref: Annotated[str, typer.Argument(help="Berth ID or label")],
    dock: Annotated[
        str | None, typer.Option(help="Dock ID to disambiguate label")
    ] = None,
):
    """Mark a berth as reserved (suppresses sensor events and alerts)."""
    asyncio.run(_berth_set_reserved(berth_ref, dock, reserved=True))


@berth_app.command("unreserve")
def berth_unreserve(
    berth_ref: Annotated[str, typer.Argument(help="Berth ID or label")],
    dock: Annotated[
        str | None, typer.Option(help="Dock ID to disambiguate label")
    ] = None,
):
    """Mark a berth as unreserved (re-enables sensor events and alerts)."""
    asyncio.run(_berth_set_reserved(berth_ref, dock, reserved=False))


@berth_app.command("unassign")
def berth_unassign(
    berth_ref: Annotated[str, typer.Argument(help="Berth ID or label")],
    dock: Annotated[
        str | None, typer.Option(help="Dock ID to disambiguate label")
    ] = None,
):
    """Remove the assignment from a berth."""
    asyncio.run(_berth_unassign(berth_ref, dock))


async def _berth_set_reserved(
    berth_ref: str, dock: str | None, *, reserved: bool
) -> None:
    async with get_sessionmaker()() as session:
        berth = await _resolve_berth(session, berth_ref, dock)
        if berth.is_reserved == reserved:
            state = "reserved" if reserved else "unreserved"
            typer.echo(f"Berth {berth.berth_id} is already {state}")
            return
        berth.is_reserved = reserved
        await session.commit()
    state = "reserved" if reserved else "unreserved"
    typer.echo(f"Berth {berth.berth_id} ({berth.label}) marked {state}")


async def _resolve_berth(session, berth_ref: str, dock: str | None) -> Berth:
    berth = await session.get(Berth, berth_ref)
    if berth is not None:
        return berth

    stmt = select(Berth).where(Berth.label == berth_ref)
    if dock is not None:
        stmt = stmt.where(Berth.dock_id == dock)
    result = await session.execute(stmt)
    matches = result.scalars().all()

    if len(matches) == 0:
        typer.echo(f"Error: no berth found for '{berth_ref}'", err=True)
        raise typer.Exit(1)
    if len(matches) > 1:
        ids = ", ".join(f"{b.berth_id} (dock {b.dock_id})" for b in matches)
        typer.echo(
            f"Error: label '{berth_ref}' matches multiple berths: {ids}\n"
            "Use --dock to disambiguate.",
            err=True,
        )
        raise typer.Exit(1)
    return matches[0]


async def _berth_assign(email: str, berth_ref: str, dock: str | None) -> None:
    async with get_sessionmaker()() as session:
        user_row = await session.execute(select(User).where(User.email == email))
        user = user_row.scalar_one_or_none()
        if user is None:
            typer.echo(f"Error: no user with email {email}", err=True)
            raise typer.Exit(1)

        berth = await _resolve_berth(session, berth_ref, dock)

        existing = await session.get(Assignment, berth.berth_id)
        if existing is not None:
            existing.user_id = user.user_id
        else:
            session.add(Assignment(berth_id=berth.berth_id, user_id=user.user_id))

        await session.commit()

    typer.echo(f"Assigned berth {berth.berth_id} ({berth.label}) to {email}")


async def _berth_unassign(berth_ref: str, dock: str | None) -> None:
    async with get_sessionmaker()() as session:
        berth = await _resolve_berth(session, berth_ref, dock)
        existing = await session.get(Assignment, berth.berth_id)
        if existing is None:
            typer.echo(f"Berth {berth.berth_id} has no assignment")
            return
        await session.delete(existing)
        await session.commit()

    typer.echo(f"Unassigned berth {berth.berth_id} ({berth.label})")


async def _list_assignments() -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(select(Assignment).order_by(Assignment.berth_id))
        rows = result.scalars().all()

    table = Table("Berth ID", "User ID")
    for a in rows:
        table.add_row(a.berth_id, a.user_id)
    _console.print(table)


async def _list_events(limit: int) -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(
            select(Event).order_by(Event.timestamp.desc()).limit(limit)
        )
        rows = result.scalars().all()

    table = Table("ID", "Berth", "Type", "Sensor Raw", "Timestamp")
    for e in rows:
        table.add_row(
            e.event_id,
            e.berth_id,
            e.event_type,
            str(e.sensor_raw),
            str(e.timestamp),
        )
    _console.print(table)


async def _list_alerts(unacked: bool) -> None:
    async with get_sessionmaker()() as session:
        stmt = select(Alert).order_by(Alert.timestamp.desc())
        if unacked:
            stmt = stmt.where(Alert.acknowledged.is_(False))
        result = await session.execute(stmt)
        rows = result.scalars().all()

    table = Table("ID", "Berth", "Type", "Message", "Acked", "Timestamp")
    for a in rows:
        table.add_row(
            a.alert_id,
            a.berth_id,
            a.type,
            a.message,
            "yes" if a.acknowledged else "no",
            str(a.timestamp),
        )
    _console.print(table)


async def _delete_user(email: str) -> None:
    async with get_sessionmaker()() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            typer.echo(f"Error: no user with email {email}", err=True)
            raise typer.Exit(1)
        await session.delete(user)
        await session.commit()
    typer.echo(f"Deleted user {email}")


async def _ack_alert(alert_id: str) -> None:
    async with get_sessionmaker()() as session:
        alert = await session.get(Alert, alert_id)
        if alert is None:
            typer.echo(f"Error: no alert with id {alert_id}", err=True)
            raise typer.Exit(1)
        if alert.acknowledged:
            typer.echo(f"Alert {alert_id} is already acknowledged")
            return
        alert.acknowledged = True
        await session.commit()
    typer.echo(f"Acknowledged alert {alert_id}")


async def _reset_berth(berth_ref: str, dock: str | None) -> None:
    async with get_sessionmaker()() as session:
        berth = await _resolve_berth(session, berth_ref, dock)
        berth.status = "free"
        await session.commit()
    typer.echo(f"Reset berth {berth.berth_id} ({berth.label}) to free")


async def _create_berth(
    dock_id: str,
    label: str | None,
    length: float | None,
    width: float | None,
    depth: float | None,
) -> None:
    async with get_sessionmaker()() as session:
        dock = await session.get(Dock, dock_id)
        if dock is None:
            typer.echo(f"Error: no dock with id {dock_id}", err=True)
            raise typer.Exit(1)

        berth = Berth(
            berth_id=str(uuid.uuid4()),
            dock_id=dock_id,
            label=label,
            length_m=length,
            width_m=width,
            depth_m=depth,
            status="free",
        )
        session.add(berth)
        await session.commit()

    typer.echo(f"Created berth {berth.berth_id} (label={label}) in dock {dock_id}")


async def _create_event(
    berth_id: str, event_type: EventType, sensor_raw: int, node_id: str
) -> None:
    async with get_sessionmaker()() as session:
        berth = await session.get(Berth, berth_id)
        if berth is None:
            typer.echo(f"Error: no berth with id {berth_id}", err=True)
            raise typer.Exit(1)

        event = Event(
            event_id=str(uuid.uuid4()),
            berth_id=berth_id,
            node_id=node_id,
            event_type=event_type.value,
            sensor_raw=sensor_raw,
            timestamp=datetime.now(UTC),
        )
        session.add(event)
        await session.commit()

    typer.echo(
        f"Created event {event.event_id} ({event_type.value}) on berth {berth_id}"
    )


async def _create_alert(berth_id: str, alert_type: AlertType, message: str) -> None:
    async with get_sessionmaker()() as session:
        berth = await session.get(Berth, berth_id)
        if berth is None:
            typer.echo(f"Error: no berth with id {berth_id}", err=True)
            raise typer.Exit(1)

        alert = Alert(
            alert_id=str(uuid.uuid4()),
            berth_id=berth_id,
            type=alert_type.value,
            message=message,
            timestamp=datetime.now(UTC),
        )
        session.add(alert)
        await session.commit()

    typer.echo(
        f"Created alert {alert.alert_id} ({alert_type.value}) on berth {berth_id}"
    )


async def _seed_db() -> None:
    harbor_id = "h1"
    dock_id = "d1"

    async with get_sessionmaker()() as session:
        existing = await session.get(Harbor, harbor_id)
        if existing is not None:
            typer.echo("Seed data already present — skipping")
            return

        berths = [
            Berth(berth_id=f"b{i}", dock_id=dock_id, label=f"B{i}", status="free")
            for i in range(1, 6)
        ]
        session.add_all(
            [
                Harbor(harbor_id=harbor_id, name="Dev Harbor"),
                Dock(dock_id=dock_id, harbor_id=harbor_id, name="Main Dock"),
                *berths,
            ]
        )
        await session.commit()

    typer.echo(f"Seeded harbor {harbor_id} / dock {dock_id} / berths b1–b5")

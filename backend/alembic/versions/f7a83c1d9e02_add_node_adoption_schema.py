"""add node adoption schema

Revision ID: f7a83c1d9e02
Revises: 792f79a69290
Create Date: 2026-04-30

Adds the schema needed to adopt and provision IoT nodes:
- users.role enum (harbormaster/boat_owner)
- gateways table (one per dock)
- nodes table (provisioned mesh nodes bound to a berth)
- adoption_requests table (in-flight provisioning attempts)
- factory_keys table (factory pubkey rotation; seeded later)
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f7a83c1d9e02"
down_revision: str | Sequence[str] | None = "792f79a69290"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    user_role = sa.Enum("harbormaster", "boat_owner", name="user_role")
    user_role.create(op.get_bind(), checkfirst=False)
    op.add_column(
        "users",
        sa.Column(
            "role",
            user_role,
            nullable=False,
            server_default="boat_owner",
        ),
    )
    op.alter_column("users", "role", server_default=None)

    op.create_table(
        "gateways",
        sa.Column("gateway_id", sa.String(), nullable=False),
        sa.Column("dock_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("online", "offline", name="gateway_status"),
            nullable=False,
        ),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["dock_id"], ["docks.dock_id"]),
        sa.PrimaryKeyConstraint("gateway_id"),
        sa.UniqueConstraint("dock_id"),
    )

    op.create_table(
        "nodes",
        sa.Column("node_id", sa.String(), nullable=False),
        sa.Column("mesh_uuid", sa.String(), nullable=False),
        sa.Column("serial_number", sa.String(), nullable=False),
        sa.Column("berth_id", sa.String(), nullable=False),
        sa.Column("gateway_id", sa.String(), nullable=False),
        sa.Column("mesh_unicast_addr", sa.String(), nullable=False),
        sa.Column("dev_key_fp", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "provisioned",
                "offline",
                "decommissioned",
                name="node_status",
            ),
            nullable=False,
        ),
        sa.Column("adopted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("adopted_by_user_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["berth_id"], ["berths.berth_id"]),
        sa.ForeignKeyConstraint(["gateway_id"], ["gateways.gateway_id"]),
        sa.ForeignKeyConstraint(["adopted_by_user_id"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("node_id"),
        sa.UniqueConstraint("mesh_uuid"),
        sa.UniqueConstraint("serial_number"),
    )
    # Only one live node per berth; decommissioned rows kept for history.
    op.create_index(
        "ix_nodes_berth_active",
        "nodes",
        ["berth_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'decommissioned'"),
    )

    op.create_table(
        "adoption_requests",
        sa.Column("request_id", sa.String(), nullable=False),
        sa.Column("mesh_uuid", sa.String(), nullable=False),
        sa.Column("serial_number", sa.String(), nullable=False),
        sa.Column("claim_jti", sa.String(), nullable=False),
        sa.Column("gateway_id", sa.String(), nullable=False),
        sa.Column("berth_id", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "ok", "err", name="adoption_status"),
            nullable=False,
        ),
        sa.Column("error_code", sa.String(), nullable=True),
        sa.Column("error_msg", sa.String(), nullable=True),
        sa.Column("mesh_unicast_addr", sa.String(), nullable=True),
        sa.Column("dev_key_fp", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["gateway_id"], ["gateways.gateway_id"]),
        sa.ForeignKeyConstraint(["berth_id"], ["berths.berth_id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("request_id"),
        sa.UniqueConstraint("claim_jti"),
    )

    op.create_table(
        "factory_keys",
        sa.Column("key_id", sa.String(), nullable=False),
        sa.Column("algorithm", sa.String(), nullable=False),
        sa.Column("public_key_pem", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("key_id"),
    )


def downgrade() -> None:
    op.drop_table("factory_keys")
    op.drop_table("adoption_requests")
    op.drop_index("ix_nodes_berth_active", table_name="nodes")
    op.drop_table("nodes")
    op.drop_table("gateways")
    op.drop_column("users", "role")
    sa.Enum(name="adoption_status").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="node_status").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="gateway_status").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=False)

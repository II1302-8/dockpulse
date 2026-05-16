"""shared test helpers, pure functions only (DB-touching helpers are async)"""

from __future__ import annotations

import os
import time
from datetime import UTC, datetime

import jwt
from argon2 import PasswordHasher
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FactoryDevice

AUTH_JWT_ALGORITHM = "HS256"

DEFAULT_SERIAL = "DP-N-000123"
DEFAULT_UUID = "0123456789abcdef0123456789abcdef"
DEFAULT_OOB = "00112233445566778899aabbccddeeff"
DEFAULT_JTI = "00000000-0000-4000-8000-000000000001"

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(hash_: str, password: str) -> bool:
    return _ph.verify(hash_, password)


def make_auth_token(user_id: str, token_version: int = 0) -> str:
    return jwt.encode(
        {"sub": user_id, "ver": token_version},
        os.environ["SECRET_KEY"],
        algorithm=AUTH_JWT_ALGORITHM,
    )


def auth_cookies(user_id: str, token_version: int = 0) -> dict[str, str]:
    # csrf value is arbitrary, conftest event hook echoes the cookie back as a header
    return {
        "dockpulse_access": make_auth_token(user_id, token_version),
        "dockpulse_csrf": "test-csrf",
    }


def make_qr_payload(
    *,
    serial: str = DEFAULT_SERIAL,
    jti: str = DEFAULT_JTI,
) -> str:
    # sticker is name + replay-protection token, the OOB inside factory_nvs
    # is the real auth via PB-ADV
    return f"{serial}:{jti}"


async def seed_factory_device(
    session: AsyncSession,
    *,
    serial: str = DEFAULT_SERIAL,
    jti: str = DEFAULT_JTI,
    uuid_hex: str = DEFAULT_UUID,
    oob_hex: str = DEFAULT_OOB,
    exp_offset_s: int = 3600,
) -> None:
    now = datetime.now(UTC)
    exp = datetime.fromtimestamp(time.time() + exp_offset_s, tz=UTC)
    session.add(
        FactoryDevice(
            serial_number=serial,
            mesh_uuid=uuid_hex,
            oob_hex=oob_hex,
            claim_jti=jti,
            claim_exp=exp,
            registered_at=now,
        )
    )
    await session.commit()


async def make_qr_and_register(
    session: AsyncSession,
    *,
    serial: str = DEFAULT_SERIAL,
    jti: str = DEFAULT_JTI,
    exp_offset_s: int = 3600,
) -> str:
    """Builds the plaintext serial:jti QR AND seeds the matching row."""
    await seed_factory_device(
        session, serial=serial, jti=jti, exp_offset_s=exp_offset_s
    )
    return make_qr_payload(serial=serial, jti=jti)

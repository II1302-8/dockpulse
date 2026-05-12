"""Background task that marks expired pending berth invites as expired"""

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_sessionmaker
from app.models import BerthInvite

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_S = 60


async def sweep_once(session: AsyncSession) -> int:
    now = datetime.now(UTC)
    stmt = (
        update(BerthInvite)
        .where(
            BerthInvite.status == "pending",
            BerthInvite.expires_at < now,
        )
        .values(status="expired")
        .returning(BerthInvite.invite_id)
        .execution_options(synchronize_session="fetch")
    )
    result = await session.execute(stmt)
    expired = list(result.scalars())
    await session.commit()
    return len(expired)


async def sweeper_loop() -> None:
    while True:
        try:
            async with get_sessionmaker()() as session:
                expired = await sweep_once(session)
            if expired:
                logger.info("expired %d berth_invites", expired)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("berth invite sweeper iteration crashed")
        await asyncio.sleep(SWEEP_INTERVAL_S)

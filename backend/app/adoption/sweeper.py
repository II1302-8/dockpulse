"""Background task that times out stale adoption_requests"""

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.adoption.finalize import publish_adoption_update
from app.db import get_sessionmaker
from app.models import AdoptionRequest

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_S = 5


async def sweep_once(session: AsyncSession) -> int:
    """Mark all expired pending requests as err:timeout. Returns count"""
    now = datetime.now(UTC)
    stmt = (
        update(AdoptionRequest)
        .where(
            AdoptionRequest.status == "pending",
            AdoptionRequest.expires_at < now,
        )
        .values(status="err", error_code="timeout", completed_at=now)
        .returning(AdoptionRequest)
        .execution_options(synchronize_session="fetch")
    )
    result = await session.execute(stmt)
    expired = list(result.scalars())
    await session.commit()
    for request in expired:
        publish_adoption_update(request)
    return len(expired)


async def sweeper_loop() -> None:
    while True:
        try:
            async with get_sessionmaker()() as session:
                expired = await sweep_once(session)
            if expired:
                logger.info("expired %d adoption_requests", expired)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("adoption sweeper iteration crashed")
        await asyncio.sleep(SWEEP_INTERVAL_S)

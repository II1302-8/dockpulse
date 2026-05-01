"""Background task that times out stale adoption_requests"""

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adoption.finalize import complete_adoption_err
from app.db import get_sessionmaker
from app.models import AdoptionRequest

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_S = 5


async def sweep_once(session: AsyncSession) -> int:
    """Mark all expired pending requests as err:timeout. Returns count"""
    now = datetime.now(UTC)
    result = await session.execute(
        select(AdoptionRequest.request_id).where(
            AdoptionRequest.status == "pending",
            AdoptionRequest.expires_at < now,
        )
    )
    request_ids = [row[0] for row in result.all()]
    for rid in request_ids:
        await complete_adoption_err(
            session, request_id=rid, error_code="timeout", error_msg=None
        )
    return len(request_ids)


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

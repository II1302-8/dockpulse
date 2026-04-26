import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

logger = logging.getLogger(__name__)

QUEUE_MAXSIZE = 100

_subscribers: set[asyncio.Queue[dict[str, Any]]] = set()


def publish(event: dict[str, Any]) -> None:
    for queue in _subscribers:
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("SSE subscriber queue full — dropping event")


@asynccontextmanager
async def subscribe() -> AsyncIterator[asyncio.Queue[dict[str, Any]]]:
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
    _subscribers.add(queue)
    try:
        yield queue
    finally:
        _subscribers.discard(queue)


def subscriber_count() -> int:
    return len(_subscribers)

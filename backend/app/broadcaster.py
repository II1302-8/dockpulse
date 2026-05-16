import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

logger = logging.getLogger(__name__)

QUEUE_MAXSIZE = 100

# in-band wake-up after an event was dropped, consumer refetches
STALE_EVENT_TYPE = "stream.stale"
_STALE_EVENT: dict[str, Any] = {"type": STALE_EVENT_TYPE}

_subscribers: set[asyncio.Queue[dict[str, Any]]] = set()


def publish(event: dict[str, Any]) -> None:
    # list() snapshot in case a future refactor awaits inside the loop
    for queue in list(_subscribers):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            # evict one + push stale marker, otherwise consumer freezes silently
            with contextlib.suppress(asyncio.QueueEmpty):
                queue.get_nowait()
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(_STALE_EVENT)
            logger.warning(
                "SSE subscriber queue full, dropped event type=%s "
                "(subscribers=%d, marked stale)",
                event.get("type"),
                len(_subscribers),
            )
        except Exception:
            # one broken queue must not shadow the rest
            logger.exception("SSE put_nowait crashed, dropping subscriber")
            _subscribers.discard(queue)


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

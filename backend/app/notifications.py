import asyncio
import logging

import resend

from app.config import get_settings

logger = logging.getLogger(__name__)


async def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    idempotency_key: str | None = None,
) -> None:
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning(
            "RESEND_API_KEY unset, email suppressed | to=%s | subject=%s", to, subject
        )
        return
    # resend sdk sync, offload so handler doesnt block loop
    await asyncio.to_thread(_send_sync, settings, to, subject, html, idempotency_key)


def _send_sync(
    settings,
    to: str | list[str],
    subject: str,
    html: str,
    idempotency_key: str | None,
) -> None:
    resend.api_key = settings.resend_api_key
    params: resend.Emails.SendParams = {
        "from": settings.email_from,
        "to": [to] if isinstance(to, str) else to,
        "subject": subject,
        "html": html,
    }
    try:
        if idempotency_key:
            resend.Emails.send(params, {"idempotency_key": idempotency_key})
        else:
            resend.Emails.send(params)
    except Exception:
        logger.exception("Failed to send email to %s", to)


async def send_push(user_id: str, title: str, body: str) -> None:
    # stub, resend has no push channel, needs fcm/apn
    logger.warning(
        "push not implemented | user_id=%s | title=%s | body=%s", user_id, title, body
    )

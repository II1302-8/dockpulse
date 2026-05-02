import logging

import resend

from app.config import get_settings

logger = logging.getLogger(__name__)

_FROM = "DockPulse <noreply@dockpulse.xyz>"


def send_email(to: str | list[str], subject: str, html: str) -> None:
    api_key = get_settings().resend_api_key
    if not api_key:
        logger.info("[dev] email suppressed | to=%s | subject=%s", to, subject)
        return
    resend.api_key = api_key
    try:
        resend.Emails.send(
            {
                "from": _FROM,
                "to": [to] if isinstance(to, str) else to,
                "subject": subject,
                "html": html,
            }
        )
    except Exception:
        logger.exception("Failed to send email to %s", to)


def send_push(user_id: str, title: str, body: str) -> None:
    logger.warning(
        "[dev] push not implemented | user_id=%s | title=%s | body=%s",
        user_id,
        title,
        body,
    )

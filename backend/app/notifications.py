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
    if settings.app_env != "prod":
        logger.info(
            "email suppressed (app_env=%s) | to=%s | subject=%s",
            settings.app_env,
            to,
            subject,
        )
        return
    if not settings.resend_api_key:
        logger.warning(
            "RESEND_API_KEY unset, email suppressed | to=%s | subject=%s", to, subject
        )
        return
    await asyncio.to_thread(_send_sync, settings, to, subject, html, idempotency_key)


async def send_verification_email(email: str, token: str, firstname: str) -> None:
    settings = get_settings()
    verify_url = f"{settings.app_base_url}/verify-email?token={token}"
    await send_email(
        to=email,
        subject="Verify your DockPulse account",
        html=(
            f"<h1>Welcome, {firstname}!</h1>"
            "<p>Please verify your email by clicking the link below:</p>"
            f'<a href="{verify_url}">Verify Email</a>'
            f"<p>This link expires in"
            f" {settings.verification_token_ttl_hours} hours.</p>"
            "<p>If you didn't create this account, you can safely ignore this email.</p>"
        ),
    )


async def send_account_exists_email(email: str, firstname: str) -> None:
    await send_email(
        to=email,
        subject="Someone tried to register with your DockPulse account",
        html=(
            f"<h1>Hi {firstname},</h1>"
            "<p>Someone tried to register a DockPulse account using your email"
            " address, but an account already exists.</p>"
            f"<p>If this was you, you can log in directly. "
            f"If you've forgotten your password, use the password reset flow.</p>"
            f"<p>If this wasn't you, you can safely ignore this email.</p>"
        ),
    )


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
    logger.warning(
        "push not implemented | user_id=%s | title=%s | body=%s", user_id, title, body
    )

import asyncio
import logging

import resend

from app.config import get_settings
from app.email_templates import render as render_email

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
        html=render_email(
            title="Verify your account",
            preheader="One click to activate your DockPulse account.",
            intro=f"Welcome aboard, {firstname}!",
            body_paragraphs=[
                "Tap the button below to confirm this email and finish setting "
                "up your DockPulse account.",
                f"The link expires in {settings.verification_token_ttl_hours} hours.",
            ],
            cta_url=verify_url,
            cta_label="Verify email",
            footnote=(
                "If you didn't create this account, you can safely ignore this "
                "email — no further action is needed."
            ),
        ),
    )


async def send_account_exists_email(email: str, firstname: str) -> None:
    settings = get_settings()
    login_url = settings.app_base_url
    await send_email(
        to=email,
        subject="Someone tried to register with your DockPulse account",
        html=render_email(
            title="Account already exists",
            preheader="Heads up: someone tried to sign up with your email.",
            intro=f"Hi {firstname},",
            body_paragraphs=[
                "Someone tried to register a DockPulse account using your "
                "email address, but an account already exists for it.",
                "If this was you, you can log in directly. Forgot your "
                "password? Use the reset flow on the login screen.",
            ],
            cta_url=login_url,
            cta_label="Open DockPulse",
            footnote=(
                "If this wasn't you, you can safely ignore this email — your "
                "account hasn't been changed."
            ),
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

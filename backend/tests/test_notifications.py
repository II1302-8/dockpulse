import pytest

from app import notifications


async def test_send_email_suppressed_when_no_api_key(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    called = False

    def _fail(*a, **kw):
        nonlocal called
        called = True

    warnings: list[str] = []
    monkeypatch.setattr(notifications.resend.Emails, "send", _fail)
    monkeypatch.setattr(
        notifications.logger,
        "warning",
        lambda msg, *a, **kw: warnings.append(msg % a if a else msg),
    )
    await notifications.send_email("a@b.com", "subj", "<p>hi</p>")
    assert called is False
    assert any("suppressed" in w for w in warnings)


async def test_send_email_suppressed_in_staging_even_with_api_key(monkeypatch):
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    called = False

    def _fail(*a, **kw):
        nonlocal called
        called = True

    monkeypatch.setattr(notifications.resend.Emails, "send", _fail)
    await notifications.send_email("a@b.com", "subj", "<p>hi</p>")
    assert called is False


async def test_send_email_sends_with_normalized_recipients(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "Test <noreply@test.local>")
    payloads: list[dict] = []
    monkeypatch.setattr(
        notifications.resend.Emails, "send", lambda payload: payloads.append(payload)
    )

    await notifications.send_email("one@x.com", "s", "<p>h</p>")
    await notifications.send_email(["a@x.com", "b@x.com"], "s2", "<p>h2</p>")

    assert payloads[0]["to"] == ["one@x.com"]
    assert payloads[0]["from"] == "Test <noreply@test.local>"
    assert payloads[1]["to"] == ["a@x.com", "b@x.com"]


async def test_send_email_swallows_sdk_errors(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")

    def _boom(payload):
        raise RuntimeError("resend down")

    excs: list[str] = []
    monkeypatch.setattr(notifications.resend.Emails, "send", _boom)
    monkeypatch.setattr(
        notifications.logger,
        "exception",
        lambda msg, *a, **kw: excs.append(msg % a if a else msg),
    )
    await notifications.send_email("a@b.com", "s", "<p>h</p>")
    assert any("Failed to send email" in e for e in excs)


async def test_send_push_is_stub(monkeypatch):
    warnings: list[str] = []
    monkeypatch.setattr(
        notifications.logger,
        "warning",
        lambda msg, *a, **kw: warnings.append(msg % a if a else msg),
    )
    await notifications.send_push("u1", "t", "b")
    assert any("not implemented" in w for w in warnings)


@pytest.mark.parametrize(
    "to,expected",
    [
        ("solo@x.com", ["solo@x.com"]),
        (["a@x.com", "b@x.com"], ["a@x.com", "b@x.com"]),
    ],
)
async def test_recipient_normalization(monkeypatch, to, expected):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    captured: dict = {}
    monkeypatch.setattr(
        notifications.resend.Emails, "send", lambda payload: captured.update(payload)
    )
    await notifications.send_email(to, "s", "<p>h</p>")
    assert captured["to"] == expected

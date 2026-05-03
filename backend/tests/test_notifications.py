import pytest

from app import notifications


async def test_send_email_suppressed_when_no_api_key(monkeypatch, caplog):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    called = False

    def _fail(*a, **kw):
        nonlocal called
        called = True

    monkeypatch.setattr(notifications.resend.Emails, "send", _fail)
    with caplog.at_level("WARNING", logger="app.notifications"):
        await notifications.send_email("a@b.com", "subj", "<p>hi</p>")
    assert called is False
    assert any("suppressed" in r.message for r in caplog.records)


async def test_send_email_sends_with_normalized_recipients(monkeypatch):
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


async def test_send_email_swallows_sdk_errors(monkeypatch, caplog):
    monkeypatch.setenv("RESEND_API_KEY", "re_test")

    def _boom(payload):
        raise RuntimeError("resend down")

    monkeypatch.setattr(notifications.resend.Emails, "send", _boom)
    with caplog.at_level("ERROR", logger="app.notifications"):
        await notifications.send_email("a@b.com", "s", "<p>h</p>")
    assert any("Failed to send email" in r.message for r in caplog.records)


async def test_send_push_is_stub(caplog):
    with caplog.at_level("WARNING", logger="app.notifications"):
        await notifications.send_push("u1", "t", "b")
    assert any("not implemented" in r.message for r in caplog.records)


@pytest.mark.parametrize(
    "to,expected",
    [
        ("solo@x.com", ["solo@x.com"]),
        (["a@x.com", "b@x.com"], ["a@x.com", "b@x.com"]),
    ],
)
async def test_recipient_normalization(monkeypatch, to, expected):
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    captured: dict = {}
    monkeypatch.setattr(
        notifications.resend.Emails, "send", lambda payload: captured.update(payload)
    )
    await notifications.send_email(to, "s", "<p>h</p>")
    assert captured["to"] == expected

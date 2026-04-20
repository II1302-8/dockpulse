from app.mqtt import _parse_berth_topic


def test_parse_status_topic():
    assert _parse_berth_topic("harbor/main/dock-a/berth-001/status") == (
        "main",
        "dock-a",
        "berth-001",
        "status",
    )


def test_parse_heartbeat_topic():
    assert _parse_berth_topic("harbor/main/dock-a/berth-001/heartbeat") == (
        "main",
        "dock-a",
        "berth-001",
        "heartbeat",
    )


def test_skip_gateway_topic():
    assert _parse_berth_topic("harbor/main/gateway/gw-1/status") is None


def test_wrong_prefix():
    assert _parse_berth_topic("dockpulse/main/dock-a/berth-001/status") is None


def test_too_few_segments():
    assert _parse_berth_topic("harbor/main/dock-a/status") is None


def test_too_many_segments():
    assert _parse_berth_topic("harbor/main/dock-a/berth-001/extra/status") is None

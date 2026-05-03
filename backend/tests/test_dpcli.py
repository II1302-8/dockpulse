from typer.testing import CliRunner

from scripts.dpcli.cli import app

runner = CliRunner()


def test_help_lists_commands():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    # spot-check a few commands so import + registration regressions surface
    for cmd in ("create-user", "promote-user", "seed-db", "berth"):
        assert cmd in result.output


def test_berth_subcommand_help():
    result = runner.invoke(app, ["berth", "--help"])
    assert result.exit_code == 0
    for cmd in ("assign", "reserve", "unreserve", "unassign"):
        assert cmd in result.output


def test_event_type_rejects_invalid_value():
    # validates the StrEnum input — bad value never reaches DB
    result = runner.invoke(app, ["create-event", "b1", "bogus"])
    assert result.exit_code != 0
    assert "bogus" in result.output or "Invalid" in result.output

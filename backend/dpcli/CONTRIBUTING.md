# Contributing to dpcli

`dpcli` is the DockPulse developer CLI. It talks directly to the database and is
installed automatically via `uv sync`.

## Adding a new command

1. Open `backend/dpcli/cli.py`
2. Add a synchronous command function decorated with `@app.command()`:

```python
@app.command()
def my_command(
    berth_id: Annotated[str, typer.Argument(help="Berth ID")],
    verbose: Annotated[bool, typer.Option(help="Print extra info")] = False,
):
    """One-line description shown in --help."""
    asyncio.run(_my_command(berth_id, verbose))
```

3. Add the async implementation below:

```python
async def _my_command(berth_id: str, verbose: bool) -> None:
    async with get_sessionmaker()() as session:
        berth = await session.get(Berth, berth_id)
        if berth is None:
            typer.echo(f"Error: no berth {berth_id}", err=True)
            raise typer.Exit(1)
        typer.echo(f"Berth {berth_id}: {berth.status}")
```

4. Run `uv sync` to pick up the change, then verify:

```bash
dpcli --help          # new command appears
dpcli my-command --help
```

No registration or imports needed.
Typer discovers commands from `@app.command()` automatically.

## How --help is generated

Typer introspects the function at import time:

| Source                     | Output in `--help`                    |
| -------------------------- | ------------------------------------- |
| Docstring                  | Command description                   |
| Function name              | Command name (underscores → hyphens)  |
| `typer.Argument(help=...)` | Positional arg description            |
| `typer.Option(help=...)`   | Flag description                      |
| Type hint                  | Argument type / allowed enum values   |
| Default value              | Shown as `[default: ...]`             |

No separate docs to maintain, the code is the documentation.

## Argument patterns

```python
# Positional argument (required, no flag)
# Usage: dpcli my-cmd user@example.com
email: Annotated[str, typer.Argument(help="User email")]

# Required option (must be passed as a flag)
# Usage: dpcli my-cmd --email user@example.com
email: Annotated[str, typer.Option(help="User email")]

# Optional flag with default
# Usage: dpcli my-cmd            (uses 50)
#        dpcli my-cmd --limit 10
limit: Annotated[int, typer.Option(help="Max rows")] = 50

# Optional value, omitted if not passed
# Usage: dpcli my-cmd
#        dpcli my-cmd --dock d1
dock: Annotated[str | None, typer.Option(help="Dock ID")] = None

# Boolean flag
# Usage: dpcli my-cmd --unacked
unacked: Annotated[bool, typer.Option(help="Unacknowledged only")] = False

# Prompted interactively if not passed on the command line
# Usage: dpcli my-cmd             → prints "Firstname: " and waits
#        dpcli my-cmd --firstname Anna
firstname: Annotated[str, typer.Option(prompt=True)]

# Prompted with hidden input + confirmation (passwords)
# Usage: dpcli my-cmd             → prints "Password: " (hidden) then "Repeat: "
#        dpcli my-cmd --password secret
password: Annotated[str, typer.Option(prompt=True, hide_input=True, confirmation_prompt=True)]

# Enum — only accepts declared values, renders as [value1|value2] in --help
# Usage: dpcli my-cmd --role harbormaster
role: Annotated[Role, typer.Option(help="User role")] = Role.boat_owner
```

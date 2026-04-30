"""Dump the FastAPI-generated OpenAPI spec to docs/api/openapi.yml.

The committed YAML is the source of truth for frontend codegen and Prism
mocking, but it is generated from the running app — this script keeps
it in sync.

Run from the repo root or the backend dir; the output path is resolved
relative to this file.

    uv run python -m scripts.dump_openapi             # write
    uv run python -m scripts.dump_openapi --check     # CI: fail on drift
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import yaml

# The app must be importable; pretend env vars are set so nothing tries
# to connect during import. Engine creation does not require a live DB,
# but the URL must use a dialect whose driver is installed (asyncpg).
os.environ.setdefault("SECRET_KEY", "dump-only-not-a-real-secret")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://dump:dump@127.0.0.1:1/dump")

from app.main import app  # noqa: E402

OUTPUT_PATH = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.yml"


def render_spec() -> str:
    spec = app.openapi()
    return yaml.safe_dump(spec, sort_keys=True, allow_unicode=True, width=100)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero if the committed file differs from generated.",
    )
    args = parser.parse_args()

    rendered = render_spec()

    if args.check:
        if not OUTPUT_PATH.exists():
            print(f"{OUTPUT_PATH} does not exist", file=sys.stderr)
            return 1
        existing = OUTPUT_PATH.read_text()
        if existing != rendered:
            print(
                "OpenAPI spec is out of date. "
                "Run `uv run python -m scripts.dump_openapi` and commit.",
                file=sys.stderr,
            )
            return 1
        print("OpenAPI spec is up to date.")
        return 0

    OUTPUT_PATH.write_text(rendered)
    print(f"Wrote {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

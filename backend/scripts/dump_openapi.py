"""Dump the FastAPI-generated OpenAPI spec to docs/api/openapi.yml."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from app.main import app

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

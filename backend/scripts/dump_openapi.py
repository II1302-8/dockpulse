"""Dump the FastAPI-generated OpenAPI spec to docs/api/openapi.yml."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

import yaml

# committed spec is canonical, render with prod constraints regardless of caller env
os.environ["APP_ENV"] = "prod"
# Settings validates SECRET_KEY length, dump uses a non-secret placeholder
os.environ.setdefault("SECRET_KEY", "openapi-dump-placeholder-not-for-jwt-signing")

from app.main import app  # noqa: E402

OUTPUT_PATH = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.yml"


def _inline_examples_into_anyof(node: Any) -> None:
    # prism's static sampler ignores examples sibling to anyOf, push them into the
    # non-null branch so nullable fields mock with real values instead of "string"
    if isinstance(node, dict):
        any_of = node.get("anyOf")
        examples = node.get("examples")
        if isinstance(any_of, list) and examples:
            for branch in any_of:
                if isinstance(branch, dict) and branch.get("type") != "null":
                    branch.setdefault("examples", examples)
                    break
        for v in node.values():
            _inline_examples_into_anyof(v)
    elif isinstance(node, list):
        for item in node:
            _inline_examples_into_anyof(item)


def render_spec() -> str:
    spec = app.openapi()
    _inline_examples_into_anyof(spec)
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

#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "requests>=2.31",
# ]
# ///
"""
Demo setup script — run from repo root:
    uv run tools/demo_setup.py

Creates two demo accounts, assigns a berth, opens an availability window,
places a confirmed booking, then launches fake_publisher so the map shows
live sensor data (some green, the booked berth red).
"""

import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import requests

ROOT = Path(__file__).parent.parent
BACKEND_DIR = ROOT / "backend"
API = "http://localhost:8000"

HARBOR_ID = "ksss-saltsjobaden"
DOCK_ID = "ksss-saltsjobaden-pier-1"
DEMO_BERTH = f"{DOCK_ID}-t2"  # second slot on the top row — visible without zooming

OWNER_EMAIL = "demo-owner@dockpulse.com"
OWNER_PASS = "demo"
VISITOR_EMAIL = "demo-visitor@dockpulse.com"
VISITOR_PASS = "demo"

today = date.today()
AVAIL_FROM = today.isoformat()
AVAIL_TO = (today + timedelta(days=14)).isoformat()
BOOK_FROM = today.isoformat()
BOOK_TO = (today + timedelta(days=3)).isoformat()

# ── ANSI colours ─────────────────────────────────────────────────────────────
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
CYAN = "\033[36m"
BOLD = "\033[1m"
RESET = "\033[0m"


def ok(msg):
    print(f"{GREEN}✓{RESET} {msg}")


def warn(msg):
    print(f"{YELLOW}~{RESET} {msg}")


def err(msg):
    print(f"{RED}✗{RESET} {msg}")
    sys.exit(1)


def step(msg):
    print(f"\n{BOLD}{CYAN}{msg}{RESET}")


# ── helpers ───────────────────────────────────────────────────────────────────


def dpcli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["uv", "run", "dpcli", *args],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )


def login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": email, "password": password})
    if not r.ok:
        err(f"Login failed for {email}: {r.status_code} {r.text}")
    csrf = s.cookies.get("dockpulse_csrf")
    if not csrf:
        err(f"No CSRF cookie after login as {email}")
    s.headers["X-CSRF-Token"] = csrf
    ok(f"Logged in as {email}")
    return s


# ── steps ─────────────────────────────────────────────────────────────────────


def check_api():
    step("1 / 6  Checking API is reachable")
    try:
        requests.get(f"{API}/api/health", timeout=3)
        ok(f"API at {API} is up")
    except requests.ConnectionError:
        err(f"Cannot reach {API} — is the stack running? (docker compose up)")


def create_users():
    step("2 / 6  Creating demo users")
    for email, password, first, last in [
        (OWNER_EMAIL, OWNER_PASS, "Demo", "Owner"),
        (VISITOR_EMAIL, VISITOR_PASS, "Demo", "Visitor"),
    ]:
        result = dpcli(
            "create-user",
            "--email",
            email,
            "--password",
            password,
            "--firstname",
            first,
            "--lastname",
            last,
        )
        if result.returncode == 0:
            ok(result.stdout.strip())
        elif "already in use" in result.stderr:
            warn(f"{email} already exists — skipping")
        else:
            err(f"create-user failed: {result.stderr.strip()}")


def assign_berth():
    step("3 / 6  Assigning berth to owner + granting harbormaster")
    result = dpcli("berth", "assign", OWNER_EMAIL, DEMO_BERTH)
    if result.returncode == 0:
        ok(result.stdout.strip())
    else:
        err(f"berth assign failed: {result.stderr.strip()}")
    result = dpcli("grant-harbor", OWNER_EMAIL, HARBOR_ID)
    if result.returncode == 0:
        ok(result.stdout.strip())
    elif "already harbormaster" in result.stdout:
        warn(f"{OWNER_EMAIL} already harbormaster — skipping")
    else:
        err(f"grant-harbor failed: {result.stderr.strip()}")


def open_availability(owner_session: requests.Session):
    step("4 / 6  Opening availability window (owner is away)")
    r = owner_session.post(
        f"{API}/api/berths/{DEMO_BERTH}/availability",
        json={"from_date": AVAIL_FROM, "return_date": AVAIL_TO},
    )
    if r.status_code == 201:
        ok(f"Window open: {AVAIL_FROM} → {AVAIL_TO}")
    elif r.status_code == 409:
        warn("Availability window overlaps existing one — skipping")
    else:
        err(f"create availability failed: {r.status_code} {r.text}")


def place_booking(visitor_session: requests.Session):
    step("5 / 6  Placing booking as visitor")
    r = visitor_session.post(
        f"{API}/api/berths/{DEMO_BERTH}/bookings",
        json={"from_date": BOOK_FROM, "to_date": BOOK_TO},
    )
    if r.status_code == 201:
        b = r.json()
        ok(f"Booking confirmed: {b['booking_id']}  ({BOOK_FROM} → {BOOK_TO})")
    elif r.status_code == 409:
        warn("Overlapping booking already exists — skipping")
    else:
        err(f"create booking failed: {r.status_code} {r.text}")


def start_publisher():
    step("6 / 6  Starting fake sensor publisher")
    proc = subprocess.Popen(
        [
            "uv",
            "run",
            str(ROOT / "tools" / "fake_publisher.py"),
            "--all",
            "--flip-prob",
            "0.1",  # berths randomly flip so the map feels alive
            "--rate",
            "6",
        ],
        cwd=ROOT,
    )
    ok(f"fake_publisher running (pid {proc.pid})  — Ctrl-C to stop")
    return proc


def summary():
    print(
        f"\n{BOLD}═══════════════════════════════════════════════════{RESET}\n"
        f"    Demo ready — open the harbor map in your browser.\n"
        f"\n"
        f"    Berth   {DEMO_BERTH}\n"
        f"    Booked  {BOOK_FROM} → {BOOK_TO}  (shows RED on map)\n"
        f"    Owner   {OWNER_EMAIL}  / {OWNER_PASS}\n"
        f"    Visitor {VISITOR_EMAIL}  / {VISITOR_PASS}\n"
        f"{BOLD}═══════════════════════════════════════════════════{RESET}\n"
    )


# ── main ──────────────────────────────────────────────────────────────────────


def main():
    check_api()
    create_users()
    assign_berth()
    owner = login(OWNER_EMAIL, OWNER_PASS)
    open_availability(owner)
    visitor = login(VISITOR_EMAIL, VISITOR_PASS)
    place_booking(visitor)
    proc = start_publisher()
    summary()
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        print("\nPublisher stopped.")


if __name__ == "__main__":
    main()

import json
import logging
import logging.config
import os
import re
import threading
import time
from contextvars import ContextVar

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_UUID_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
_HEX_RE = re.compile(r"\b[0-9a-fA-F]{16,}\b")
_IPV4_RE = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")


def _normalize(msg: str) -> str:
    msg = _UUID_RE.sub("<uuid>", msg)
    msg = _HEX_RE.sub("<hex>", msg)
    msg = _IPV4_RE.sub("<ip>", msg)
    return msg


class DedupFilter(logging.Filter):
    """Collapse high-volume repeats that differ only by IP/UUID/hex tokens.

    Records >= ERROR always pass through unchanged.
    """

    def __init__(self, window: float = 60.0, max_keys: int = 4096):
        super().__init__()
        self.window = window
        self.max_keys = max_keys
        self._state: dict[tuple[str, int, str], dict] = {}
        self._lock = threading.Lock()

    def filter(self, record: logging.LogRecord) -> bool:
        if getattr(record, "dedup_summary", False):
            return True
        if record.levelno >= logging.ERROR:
            return True
        try:
            formatted = record.getMessage()
        except Exception:
            return True

        key = (record.name, record.levelno, _normalize(formatted))
        now = time.monotonic()

        expired: list[dict] = []
        pass_through: bool
        with self._lock:
            stale = [
                k
                for k, v in self._state.items()
                if now - v["first_seen"] >= self.window
            ]
            for k in stale:
                v = self._state.pop(k)
                if v["count"] > 0:
                    expired.append(v)

            entry = self._state.get(key)
            if entry is None:
                self._state[key] = {
                    "first_seen": now,
                    "count": 0,
                    "level": record.levelno,
                    "logger": record.name,
                    "sample": formatted,
                }
                pass_through = True
            else:
                entry["count"] += 1
                pass_through = False

            if len(self._state) > self.max_keys:
                self._state.clear()

        for v in expired:
            logging.getLogger(v["logger"]).log(
                v["level"],
                "%s (repeated %d more times in last %.0fs)",
                v["sample"],
                v["count"],
                self.window,
                extra={"dedup_summary": True},
            )

        return pass_through


def setup_logging() -> None:
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_format = os.environ.get("LOG_FORMAT", "text").lower()
    dedup_enabled = _env_bool("LOG_DEDUP_ENABLED", True)
    dedup_window = _env_float("LOG_DEDUP_WINDOW", 60.0)

    formatter = "json" if log_format == "json" else "text"
    handler_filters = ["request_id"]
    filters: dict = {"request_id": {"()": RequestIdFilter}}
    if dedup_enabled:
        filters["dedup"] = {"()": DedupFilter, "window": dedup_window}
        handler_filters.append("dedup")

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": filters,
            "formatters": {
                "text": {
                    "format": (
                        "%(asctime)s %(levelname)-8s "
                        "[%(request_id)s] %(name)s: %(message)s"
                    ),
                    "datefmt": "%Y-%m-%dT%H:%M:%S%z",
                },
                "json": {"()": JsonFormatter},
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stdout",
                    "formatter": formatter,
                    "filters": handler_filters,
                },
            },
            "root": {
                "level": log_level,
                "handlers": ["default"],
            },
            "loggers": {
                "app": {"level": log_level, "propagate": True},
                "uvicorn": {"level": log_level, "propagate": True},
                "uvicorn.error": {"level": log_level, "propagate": True},
                "uvicorn.access": {"level": log_level, "propagate": True},
                "aiomqtt": {"level": "WARNING", "propagate": True},
                "sqlalchemy.engine": {"level": "WARNING", "propagate": True},
            },
        }
    )
    logging.getLogger("uvicorn.access").handlers = []
    logging.getLogger("uvicorn.error").handlers = []
    logging.getLogger("uvicorn").handlers = []

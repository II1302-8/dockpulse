#!/bin/sh
# nightly pg_dump loop, retains last RETENTION_DAYS gz dumps in /backups
set -eu

: "${PGHOST:?PGHOST must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
SLEEP_SECONDS="${SLEEP_SECONDS:-86400}"

mkdir -p "$BACKUP_DIR"

while true; do
    ts=$(date -u +%Y%m%d-%H%M%SZ)
    out="$BACKUP_DIR/dockpulse-${ts}.sql.gz"
    tmp="${out}.partial"
    echo "[pg-backup] dumping ${PGDATABASE}@${PGHOST} -> ${out}"
    if pg_dump --format=plain --no-owner --no-privileges "$PGDATABASE" | gzip -9 > "$tmp"; then
        mv "$tmp" "$out"
        echo "[pg-backup] wrote $(stat -c%s "$out") bytes"
    else
        echo "[pg-backup] dump failed, removing partial" >&2
        rm -f "$tmp"
    fi
    find "$BACKUP_DIR" -maxdepth 1 -name 'dockpulse-*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete
    sleep "$SLEEP_SECONDS"
done

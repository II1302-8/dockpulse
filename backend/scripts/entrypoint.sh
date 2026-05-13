#!/bin/sh
# wraps the backend container start so migrations run inside the same service
# instead of a separate one-shot container that exits and trips komodo/compose
# "unhealthy" warnings. only migrates on full server start, not for one-off
# tooling (dpcli, alembic, sh) so `docker compose run --rm backend dpcli ...`
# doesn't double-migrate
set -e

case "$1" in
  uvicorn|gunicorn|hypercorn)
    echo "[entrypoint] running alembic upgrade head"
    alembic upgrade head
    ;;
esac

exec "$@"

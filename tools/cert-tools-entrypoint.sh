#!/bin/sh
# Entrypoint for the cert-tools container.
#
# Installs runtime deps, runs gen_certs.sh with whatever args were passed
# (default: bootstrap), then either sleeps forever (so Komodo / `docker ps`
# show a healthy long-running container) or exits cleanly when invoked with
# a one-shot subcommand like `device <id>`.
set -eu

apk add --no-cache --quiet bash openssl >/dev/null
bash /scripts/gen_certs.sh "$@"

# Stay alive after bootstrap so the stack has a stable cert-tools container
# to `docker compose exec` into. Other subcommands (device, etc.) exit.
case "${1:-bootstrap}" in
  bootstrap|"") exec sleep infinity ;;
  *) ;;
esac

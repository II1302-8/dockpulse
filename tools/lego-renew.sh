#!/bin/sh
# Obtain + renew the public TLS cert for the prod MQTT broker.
#
# Runs inside an alpine container with the docker socket mounted so it can
# SIGHUP the mosquitto container after a successful renewal. Cert material is
# written into /le, which is the mqtt-certs named volume shared with mosquitto.
#
# Required env:
#   LEGO_EMAIL                  ACME registration email
#   LEGO_DOMAIN                 e.g. mqtt.dockpulse.xyz
#   CLOUDFLARE_DNS_API_TOKEN    Cloudflare API token with Zone:DNS:Edit
#   MOSQUITTO_CONTAINER         e.g. dockpulse-prod-mosquitto
set -eu

: "${LEGO_EMAIL:?must be set}"
: "${LEGO_DOMAIN:?must be set}"
: "${CLOUDFLARE_DNS_API_TOKEN:?must be set}"
: "${MOSQUITTO_CONTAINER:?must be set}"

LEGO_PATH=/le
RENEW_INTERVAL=${RENEW_INTERVAL:-43200}  # 12h

apk add --no-cache --quiet lego docker-cli >/dev/null

publish_cert() {
  local src_crt="$LEGO_PATH/certificates/${LEGO_DOMAIN}.crt"
  local src_key="$LEGO_PATH/certificates/${LEGO_DOMAIN}.key"
  if [ ! -f "$src_crt" ] || [ ! -f "$src_key" ]; then
    echo "lego output missing at $src_crt" >&2
    return 1
  fi
  cp "$src_crt" "$LEGO_PATH/server.crt"
  cp "$src_key" "$LEGO_PATH/server.key"
  chmod 644 "$LEGO_PATH/server.crt" "$LEGO_PATH/server.key"
}

reload_mosquitto() {
  if docker kill -s HUP "$MOSQUITTO_CONTAINER" >/dev/null 2>&1; then
    echo "Sent SIGHUP to $MOSQUITTO_CONTAINER"
  else
    echo "Could not signal $MOSQUITTO_CONTAINER (not running yet?)"
  fi
}

run_lego() {
  local subcmd="$1"
  lego \
    --accept-tos \
    --email "$LEGO_EMAIL" \
    --domains "$LEGO_DOMAIN" \
    --dns cloudflare \
    --path "$LEGO_PATH" \
    "$subcmd"
}

if [ ! -f "$LEGO_PATH/certificates/${LEGO_DOMAIN}.crt" ]; then
  echo "==> Initial issue for $LEGO_DOMAIN"
  run_lego run
  publish_cert
  reload_mosquitto
fi

while true; do
  echo "==> Renew check for $LEGO_DOMAIN"
  if run_lego renew; then
    if publish_cert; then
      reload_mosquitto
    fi
  fi
  sleep "$RENEW_INTERVAL"
done

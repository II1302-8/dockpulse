#!/usr/bin/env bash
# Generate local CAs + leaf certs for the MQTT broker.
#
# Subcommands:
#   bootstrap            Create both CAs, the (dev) server cert, and service
#                        client certs (backend, fake-publisher). Idempotent —
#                        re-running overwrites everything.
#   device <node-id>     Issue a per-device client cert under the device CA.
#                        Run once per ESP32 at flash time.
#
# Output layout (relative to repo root):
#   certs/service-ca/ca.{crt,key}        Service CA (backend, publishers)
#   certs/device-ca/ca.{crt,key}         Device CA (ESP32 nodes)
#   certs/ca-bundle.crt                  Both CAs concatenated; mosquitto
#                                        trusts every leaf signed by either.
#   certs/server/server.{crt,key}        Dev server cert. In prod, lego
#                                        replaces this with a Let's Encrypt
#                                        cert for mqtt.dockpulse.xyz.
#   certs/clients/<name>/<name>.{crt,key}  Service client certs.
#   certs/devices/<node-id>/<node-id>.{crt,key}  Per-device client certs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${CERT_DIR:-$ROOT/certs}"
DAYS_CA=3650
DAYS_LEAF=825
DAYS_DEVICE=90  # short-lived; matches LE cadence so we never need a CRL

SERVICE_CA_DIR="$CERT_DIR/service-ca"
DEVICE_CA_DIR="$CERT_DIR/device-ca"
SERVER_DIR="$CERT_DIR/server"
CLIENTS_DIR="$CERT_DIR/clients"
DEVICES_DIR="$CERT_DIR/devices"
BUNDLE="$CERT_DIR/ca-bundle.crt"

SERVER_CN="mosquitto"
SERVER_SANS="DNS:mosquitto,DNS:localhost,DNS:dockpulse-mosquitto,DNS:dockpulse-staging-mosquitto,DNS:dockpulse-prod-mosquitto,IP:127.0.0.1"
SERVICE_CLIENTS=("backend" "fake-publisher")

usage() {
  sed -n '2,15p' "$0"
  exit "${1:-1}"
}

ensure_ca() {
  local ca_dir="$1" ca_cn="$2"
  mkdir -p "$ca_dir"
  if [ -f "$ca_dir/ca.crt" ] && [ -f "$ca_dir/ca.key" ]; then
    return
  fi
  echo "==> Generating CA ($ca_cn)"
  openssl genrsa -out "$ca_dir/ca.key" 4096
  openssl req -x509 -new -nodes -key "$ca_dir/ca.key" -sha256 -days "$DAYS_CA" \
    -subj "/CN=$ca_cn" \
    -out "$ca_dir/ca.crt"
}

issue_leaf() {
  local ca_dir="$1" out_dir="$2" name="$3" cn="$4" sans="$5" days="$6"
  local key="$out_dir/$name.key"
  local csr="$out_dir/$name.csr"
  local crt="$out_dir/$name.crt"
  local ext="$out_dir/$name.ext"

  if [ -f "$crt" ] && [ -f "$key" ]; then
    echo "    (already exists, skipping)"
    return
  fi

  mkdir -p "$out_dir"
  openssl genrsa -out "$key" 2048
  openssl req -new -key "$key" -subj "/CN=$cn" -out "$csr"

  {
    echo "authorityKeyIdentifier=keyid,issuer"
    echo "basicConstraints=CA:FALSE"
    echo "keyUsage = digitalSignature, keyEncipherment"
    if [ -n "$sans" ]; then
      echo "extendedKeyUsage = serverAuth"
      echo "subjectAltName = $sans"
    else
      echo "extendedKeyUsage = clientAuth"
    fi
  } > "$ext"

  openssl x509 -req -in "$csr" -CA "$ca_dir/ca.crt" -CAkey "$ca_dir/ca.key" \
    -CAcreateserial -out "$crt" -days "$days" -sha256 -extfile "$ext"

  rm -f "$csr" "$ext"
  chmod 644 "$key"
}

build_bundle() {
  mkdir -p "$CERT_DIR"
  cat "$SERVICE_CA_DIR/ca.crt" "$DEVICE_CA_DIR/ca.crt" > "$BUNDLE"
}

cmd_bootstrap() {
  ensure_ca "$SERVICE_CA_DIR" "DockPulse Service CA"
  ensure_ca "$DEVICE_CA_DIR" "DockPulse Device CA"

  echo "==> Generating dev server cert (CN=$SERVER_CN)"
  issue_leaf "$SERVICE_CA_DIR" "$SERVER_DIR" "server" "$SERVER_CN" "$SERVER_SANS" "$DAYS_LEAF"

  for client in "${SERVICE_CLIENTS[@]}"; do
    echo "==> Generating service client cert (CN=$client)"
    issue_leaf "$SERVICE_CA_DIR" "$CLIENTS_DIR/$client" "$client" "$client" "" "$DAYS_LEAF"
  done

  build_bundle
  echo
  echo "Bootstrap complete. Certs under $CERT_DIR/"
}

cmd_device() {
  local node_id="${1:-}"
  if [ -z "$node_id" ]; then
    echo "device subcommand requires a node id (e.g. 'device esp32-node-001')" >&2
    exit 2
  fi
  if [[ ! "$node_id" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "node id must match [a-zA-Z0-9._-]+" >&2
    exit 2
  fi

  ensure_ca "$DEVICE_CA_DIR" "DockPulse Device CA"
  ensure_ca "$SERVICE_CA_DIR" "DockPulse Service CA"  # bundle needs both
  echo "==> Issuing device cert (CN=$node_id, ${DAYS_DEVICE}d)"
  # Always rotate when explicitly invoked.
  rm -f "$DEVICES_DIR/$node_id/$node_id.crt" "$DEVICES_DIR/$node_id/$node_id.key"
  issue_leaf "$DEVICE_CA_DIR" "$DEVICES_DIR/$node_id" "$node_id" "$node_id" "" "$DAYS_DEVICE"
  build_bundle

  echo
  echo "Flash these to the device (overwrite on rotate):"
  echo "  CA bundle:   $DEVICE_CA_DIR/ca.crt   (or use a public-CA bundle for the server)"
  echo "  Client cert: $DEVICES_DIR/$node_id/$node_id.crt"
  echo "  Client key:  $DEVICES_DIR/$node_id/$node_id.key"
}

case "${1:-}" in
  bootstrap|"") cmd_bootstrap ;;
  device) shift; cmd_device "$@" ;;
  -h|--help) usage 0 ;;
  *) echo "unknown subcommand: $1" >&2; usage 1 ;;
esac

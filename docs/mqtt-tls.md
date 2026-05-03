# MQTT TLS

The Mosquitto broker requires client certificates. Local development and production use different trust roots; both flows are described below.

## Local development

The `cert-tools` init service runs `tools/gen_certs.sh` against the `mqtt-pki` named volume on stack startup, producing:

- `service-ca/` — signs internal services (`backend`, `fake-publisher`).
- `device-ca/` — signs ESP32 nodes. Short-lived (90 days), no CRL.
- `ca-bundle.crt` — both CAs concatenated; what mosquitto trusts.

Issue a per-device client cert (cert-tools is already running):

```bash
docker compose exec cert-tools bash /scripts/gen_certs.sh device <node-id>
```

The new files land inside the `mqtt-pki` volume. Extract them onto the host:

```bash
docker run --rm \
  -v dockpulse_mqtt-pki:/pki:ro \
  -v "$(pwd)/out":/out \
  alpine sh -c \
  'cp /pki/devices/<node-id>/<node-id>.crt /pki/devices/<node-id>/<node-id>.key /pki/device-ca/ca.crt /out/'
```

To talk to the broker from the host with `mosquitto_sub`, extract a service cert the same way (`/pki/clients/backend/...`).

## Production: public MQTT endpoint

In production the broker listens on `mqtt.dockpulse.xyz:8883`. Set the DNS record to **DNS-only** (Cloudflare proxy off) so the host receives raw MQTT; the proxied modes don't pass TCP. The `mqtt-cert-renew` sidecar obtains and renews a Let's Encrypt cert for the hostname via DNS-01 against the Cloudflare zone, writes it into the `mqtt-certs` named volume, and SIGHUPs mosquitto on rotation. Devices verify the server with the standard public CA bundle and present a client cert issued by the device CA.

Required prod env: `MQTT_PUBLIC_HOSTNAME`, `LEGO_EMAIL`, `CLOUDFLARE_DNS_API_TOKEN` (Zone:DNS:Edit on the dockpulse.xyz zone).

### Komodo deploy notes

- `cert-tools` runs as a one-shot on every `docker compose up`. It only generates material that doesn't already exist in `mqtt-pki`, so redeploys are safe.
- Two named volumes hold cert state: `mqtt-pki` (private CAs + leaves; irreplaceable — back this up) and `mqtt-certs` (public LE cert; can be reissued any time). Add both to Komodo's volume backup list.
- Open TCP 8883 on the host firewall and point `mqtt.dockpulse.xyz` (DNS-only) at the host. The lego sidecar handles ACME via DNS-01, no inbound 80/443 needed for the broker.

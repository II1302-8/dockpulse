# Admin panel — Cloudflare tunnel + Access setup

The admin SPA is reachable only over a Cloudflare Zero-Trust tunnel; the host
never has a public listener. Cloudflare Access enforces SSO at the edge before
any request reaches the tunnel. Backend then validates the resulting
`Cf-Access-Jwt-Assertion` header on `/api/admin/*`.

## Per-environment hostnames

| Env | Hostname |
|---|---|
| prod | `admin.dockpulse.xyz` |
| staging | `admin.staging.dockpulse.xyz` |

## Cloudflare dashboard config

### 1. Reuse the existing tunnel where possible

Staging already runs a `cloudflared` sidecar (`docker-compose.staging.yml`).
Add the admin hostname to that same tunnel — no second sidecar needed. Prod
has no cloudflared today, so it gets a `cloudflared-admin` sidecar in
`docker-compose.prod.yml` purely for the admin host (the public site stays on
Traefik).

### 2. Configure public hostnames on each tunnel

Per env, two ingress rules, in this order (paths matched top-down):

| Path | Service |
|---|---|
| `admin.<env>.dockpulse.xyz/api/*` | `http://backend:8000` |
| `admin.<env>.dockpulse.xyz/*` | `http://frontend:5173` |

(`<env>` is empty for prod, `.staging` for staging.) The first rule routes
admin API calls to the backend; the second serves the SPA bundle. Existing
hostnames on the same tunnel (e.g. `staging.dockpulse.xyz`) keep working.

### 3. Create the Access application

`Access → Applications → Add an application → Self-hosted`.

- Application domain: `admin.dockpulse.xyz` (and one for staging)
- Identity provider: whatever the team uses (Google, GitHub OAuth, etc.)
- Policy: allow only the dev/ops emails or a Google group
- Application audience tag (AUD): copy this — it's needed by the backend

### 4. Wire backend env vars (only where admin is enabled)

Per env where you've created an Access application above:

```env
CF_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com
CF_ACCESS_AUD=<the AUD tag from step 3>
```

The backend caches the JWKS at `<team>.cloudflareaccess.com/cdn-cgi/access/certs`
and validates `iss`, `aud`, `exp` on every admin request.

Both vars are optional — if unset, `/api/admin/*` returns 401 with
"CF Access not configured on this server" and nothing else changes. Staging
can leave both unset until you actually want admin there.

## Verifying the path

After deploy, from a CF-Access-authenticated browser:

```bash
curl -i https://admin.dockpulse.xyz/api/admin/snapshot
# 200 OK, JSON body
```

From an unauthenticated context (e.g. raw curl with no CF cookies):

```bash
curl -i https://admin.dockpulse.xyz/api/admin/snapshot
# 302 to the Access login flow, never reaches the backend
```

If the request reaches the backend without a valid JWT (CF Access misconfig),
the backend returns 401 with `Missing Cf-Access-Jwt-Assertion header`.

## Break-glass

If CF Access goes down, admin operations remain reachable via `dpcli` over
SSH to the host running the compose stack. dpcli writes directly to the
database and is unaffected by CF outages.

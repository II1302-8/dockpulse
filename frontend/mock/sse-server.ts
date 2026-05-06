/**
 * Dev-only mock server. Handles things Prism can't express against our OpenAPI:
 *   - SSE frames for `/api/berths/stream`
 *   - cookie-setting auth flow for `/api/auth/*` (Prism enforces APIKeyCookie
 *     security but never emits Set-Cookie because the spec doesn't declare it,
 *     so login appears to succeed but `/me` 401s on every subsequent call)
 *
 * `bun dev:mock` runs this alongside Prism and Vite proxies the matching paths.
 */

type Berth = {
  berth_id: string;
  dock_id: string;
  status: "free" | "occupied";
  label?: string;
  sensor_raw?: number;
  battery_pct?: number;
  last_updated?: string;
};

const DOCK_ID = "ksss-saltsjobaden-pier-1";
const SIDES: Array<"t" | "l" | "r"> = ["t", "l", "r"];

const BERTHS: Berth[] = SIDES.flatMap((side) =>
  [1, 2, 3, 4].map((idx) => ({
    berth_id: `${DOCK_ID}-${side}${idx}`,
    dock_id: DOCK_ID,
    label: `${side.toUpperCase()}${idx}`,
    status: "free" as const,
    battery_pct: 80,
  })),
);

const PORT = Number(process.env.MOCK_SSE_PORT ?? 4011);
const INTERVAL_MS = 3000;

const MOCK_USER = {
  user_id: "u-mock-harbormaster",
  firstname: "Mock",
  lastname: "Master",
  email: "harbormaster@example.com",
  phone: null,
  boat_club: null,
  role: "harbormaster",
  assigned_berth_id: null,
};

// no Secure so http://localhost works, csrf is js-readable for double-submit
const COOKIE_BASE = "Path=/; SameSite=Lax";
const SESSION_TTL = 60 * 60 * 24;

function setSessionCookies(): string[] {
  return [
    `dockpulse_access=mock-access; HttpOnly; Max-Age=${SESSION_TTL}; ${COOKIE_BASE}`,
    `dockpulse_refresh=mock-refresh; HttpOnly; Max-Age=${SESSION_TTL}; ${COOKIE_BASE}`,
    `dockpulse_csrf=mock-csrf; Max-Age=${SESSION_TTL}; ${COOKIE_BASE}`,
  ];
}

function clearedCookies(): string[] {
  return [
    `dockpulse_access=; HttpOnly; Max-Age=0; ${COOKIE_BASE}`,
    `dockpulse_refresh=; HttpOnly; Max-Age=0; ${COOKIE_BASE}`,
    `dockpulse_csrf=; Max-Age=0; ${COOKIE_BASE}`,
  ];
}

function withSetCookies(
  body: BodyInit | null,
  cookies: string[],
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  for (const c of cookies) headers.append("Set-Cookie", c);
  if (body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(body, { ...init, headers });
}

function hasAccessCookie(req: Request): boolean {
  const raw = req.headers.get("cookie") ?? "";
  return raw.split(";").some((c) => {
    const [name, value] = c.trim().split("=");
    return name === "dockpulse_access" && value;
  });
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ detail: "Invalid or expired token" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function handleAuth(req: Request, url: URL): Response | null {
  const path = url.pathname;
  if (!path.startsWith("/api/auth/")) return null;

  if (path === "/api/auth/login" && req.method === "POST") {
    return withSetCookies(JSON.stringify(MOCK_USER), setSessionCookies());
  }
  if (path === "/api/auth/register" && req.method === "POST") {
    return withSetCookies(JSON.stringify(MOCK_USER), setSessionCookies(), {
      status: 201,
    });
  }
  if (path === "/api/auth/me" && req.method === "GET") {
    if (!hasAccessCookie(req)) return unauthorized();
    return new Response(JSON.stringify(MOCK_USER), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (path === "/api/auth/refresh" && req.method === "POST") {
    if (!hasAccessCookie(req)) return unauthorized();
    return withSetCookies(null, setSessionCookies(), { status: 204 });
  }
  if (path === "/api/auth/logout" && req.method === "POST") {
    return withSetCookies(null, clearedCookies(), { status: 204 });
  }
  return new Response("not found", { status: 404 });
}

function encodeFrame(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    const authResponse = handleAuth(req, url);
    if (authResponse) return authResponse;

    if (url.pathname !== "/api/berths/stream") {
      return new Response("not found", { status: 404 });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let i = 0;
        const tick = () => {
          const berth = BERTHS[i % BERTHS.length];
          i++;
          berth.status = berth.status === "free" ? "occupied" : "free";
          berth.last_updated = new Date().toISOString();
          controller.enqueue(
            encodeFrame("berth.update", { type: "berth.update", berth }),
          );
        };
        const handle = setInterval(tick, INTERVAL_MS);
        req.signal.addEventListener("abort", () => {
          clearInterval(handle);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
});

console.log(`mock server listening on http://localhost:${PORT}`);
console.log("  - /api/berths/stream  (SSE)");
console.log("  - /api/auth/*         (login/me/refresh/logout)");

/**
 * Dev-only mock server. Handles things Prism can't express against our OpenAPI:
 *   - SSE frames for `/api/berths/stream`
 *   - cookie-setting auth flow for `/api/auth/*` (Prism enforces APIKeyCookie
 *     security but never emits Set-Cookie because the spec doesn't declare it,
 *     so login appears to succeed but `/me` 401s on every subsequent call)
 *   - adoption POST + SSE pair for `/api/adoptions[/<id>/stream]` so the
 *     adopt modal can demo the full flow without a real backend + gateway
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

// fake adoption requests live in-memory so the SSE stream can echo + finalize them
type MockAdoptionRequest = {
  request_id: string;
  mesh_uuid: string;
  serial_number: string;
  gateway_id: string;
  berth_id: string;
  status: "pending" | "ok" | "err";
  error_code: string | null;
  error_msg: string | null;
  mesh_unicast_addr: string | null;
  expires_at: string;
  created_at: string;
  completed_at: string | null;
};

const mockAdoptions = new Map<string, MockAdoptionRequest>();

function newAdoption(body: {
  gateway_id?: string;
  berth_id?: string;
}): MockAdoptionRequest {
  const now = new Date();
  return {
    request_id: crypto.randomUUID(),
    mesh_uuid: crypto.randomUUID().replace(/-/g, ""),
    serial_number: "DP-N-MOCK-001",
    gateway_id: body.gateway_id ?? "gw-mock",
    berth_id: body.berth_id ?? "berth-mock",
    status: "pending",
    error_code: null,
    error_msg: null,
    mesh_unicast_addr: null,
    expires_at: new Date(now.getTime() + 180_000).toISOString(),
    created_at: now.toISOString(),
    completed_at: null,
  };
}

// matches dp_mesh_provisioner.c emit_state ordering, "started" is implicit
const MOCK_PHASES = [
  "link-open",
  "pb-adv-done",
  "cfg-app-key",
  "cfg-bind",
  "cfg-pub-set",
  "complete",
];
const PHASE_INTERVAL_MS = 600;

// cycle so a dev clicking Adopt repeatedly sees both happy + sad UI:
//   1st  → ok
//   2nd  → already-provisioned (fails before any phase emits, common path)
//   3rd  → ok
//   4th  → cfg-fail (fails mid-flow so the timeline shows a partial walk
//          then the failed-at-step indicator)
type MockOutcome =
  | { kind: "ok" }
  | { kind: "err"; failAfterPhase: number; code: string; msg: string };

const OUTCOME_CYCLE: MockOutcome[] = [
  { kind: "ok" },
  {
    kind: "err",
    failAfterPhase: 0,
    code: "already-provisioned",
    msg: "node already in another mesh",
  },
  { kind: "ok" },
  {
    kind: "err",
    failAfterPhase: 3,
    code: "cfg-fail",
    msg: "no AppKeyAdd ack within 5s",
  },
];

let outcomeCounter = 0;
function nextOutcome(): MockOutcome {
  const o = OUTCOME_CYCLE[outcomeCounter % OUTCOME_CYCLE.length];
  outcomeCounter++;
  return o;
}

function adoptionStream(
  request: MockAdoptionRequest,
  signal: AbortSignal,
): Response {
  const outcome = nextOutcome();
  const phasesToEmit =
    outcome.kind === "ok"
      ? MOCK_PHASES
      : MOCK_PHASES.slice(0, outcome.failAfterPhase);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (frame: Uint8Array) => {
        if (signal.aborted) return;
        try {
          controller.enqueue(frame);
        } catch {
          /* already closed */
        }
      };
      const safeClose = () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      // initial snapshot, mirrors backend's first frame
      safeEnqueue(
        encodeFrame("adoption.update", { type: "adoption.update", request }),
      );
      phasesToEmit.forEach((state, i) => {
        timers.push(
          setTimeout(
            () => {
              safeEnqueue(
                encodeFrame("adoption.state", {
                  type: "adoption.state",
                  request_id: request.request_id,
                  state,
                }),
              );
            },
            PHASE_INTERVAL_MS * (i + 1),
          ),
        );
      });
      // finalize after the last phase emits
      timers.push(
        setTimeout(
          () => {
            if (signal.aborted) return;
            const now = new Date().toISOString();
            const finalized: MockAdoptionRequest =
              outcome.kind === "ok"
                ? {
                    ...request,
                    status: "ok",
                    mesh_unicast_addr: "0x0042",
                    completed_at: now,
                  }
                : {
                    ...request,
                    status: "err",
                    error_code: outcome.code,
                    error_msg: outcome.msg,
                    completed_at: now,
                  };
            mockAdoptions.set(request.request_id, finalized);
            safeEnqueue(
              encodeFrame("adoption.update", {
                type: "adoption.update",
                request: finalized,
              }),
            );
            safeClose();
          },
          PHASE_INTERVAL_MS * (phasesToEmit.length + 1),
        ),
      );
      signal.addEventListener("abort", () => {
        for (const t of timers) clearTimeout(t);
        safeClose();
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
}

async function handleAdoptions(
  req: Request,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (path === "/api/adoptions" && req.method === "POST") {
    if (!hasAccessCookie(req)) return unauthorized();
    let body: { gateway_id?: string; berth_id?: string } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      /* allow empty body */
    }
    const request = newAdoption(body);
    mockAdoptions.set(request.request_id, request);
    return new Response(JSON.stringify(request), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
  const streamMatch = path.match(/^\/api\/adoptions\/([^/]+)\/stream$/);
  if (streamMatch && req.method === "GET") {
    const id = streamMatch[1];
    const request = mockAdoptions.get(id);
    if (!request) {
      return new Response(
        JSON.stringify({ detail: "Adoption request not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return adoptionStream(request, req.signal);
  }
  return null;
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    const authResponse = handleAuth(req, url);
    if (authResponse) return authResponse;

    const adoptionResponse = await handleAdoptions(req, url);
    if (adoptionResponse) return adoptionResponse;

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

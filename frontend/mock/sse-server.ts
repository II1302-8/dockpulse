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
  length_m?: number;
  width_m?: number;
  depth_m?: number;
  is_available_now?: boolean;
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
    length_m: 8.5,
    width_m: 3.2,
    depth_m: 2.0,
    is_available_now: true,
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

function setSessionCookies(email: string): string[] {
  return [
    `dockpulse_access=mock-access; HttpOnly; Max-Age=${SESSION_TTL}; ${COOKIE_BASE}`,
    `dockpulse_refresh=mock-refresh; HttpOnly; Max-Age=${SESSION_TTL}; ${COOKIE_BASE}`,
    `dockpulse_csrf=mock-csrf; Max-Age=${SESSION_TTL}; ${COOKIE_BASE}`,
    `dockpulse_mock_user=${encodeURIComponent(email)}; Max-Age=${SESSION_TTL}; ${COOKIE_BASE}`,
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

async function handleAuth(req: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/auth/")) return null;

  if (path === "/api/auth/login" && req.method === "POST") {
    let role = "harbormaster";
    let email = "harbormaster@example.com";
    try {
      const body = await req.clone().json();
      if (body.email === "visitor@example.com") {
        role = "visitor";
        email = "visitor@example.com";
      }
    } catch (e) {}

    const user = { ...MOCK_USER, role, email, user_id: `u-mock-${role}` };
    return withSetCookies(JSON.stringify(user), setSessionCookies(email));
  }
  if (path === "/api/auth/register" && req.method === "POST") {
    return withSetCookies(JSON.stringify(MOCK_USER), setSessionCookies(MOCK_USER.email), {
      status: 201,
    });
  }
  if (path === "/api/auth/me" && req.method === "GET") {
    if (!hasAccessCookie(req)) return unauthorized();
    
    // determine role from our mock_user cookie
    const isVisitor = req.headers.get("cookie")?.includes("visitor%40example.com") || false;
    const userId = isVisitor ? "u-mock-visitor" : "u-mock-harbormaster";
    const dims = MOCK_DIMENSIONS.get(userId);

    const user = isVisitor 
      ? { 
          ...MOCK_USER, 
          role: "visitor", 
          email: "visitor@example.com", 
          user_id: "u-mock-visitor",
          boat_length_m: dims?.length,
          boat_width_m: dims?.width,
          boat_depth_m: dims?.depth
        }
      : {
          ...MOCK_USER,
          boat_length_m: dims?.length,
          boat_width_m: dims?.width,
          boat_depth_m: dims?.depth
        };

    return new Response(JSON.stringify(user), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (path === "/api/auth/refresh" && req.method === "POST") {
    if (!hasAccessCookie(req)) return unauthorized();
    // we don't bother extracting email for refresh in mock
    return withSetCookies(null, setSessionCookies("harbormaster@example.com"), { status: 204 });
  }
  if (path === "/api/auth/logout" && req.method === "POST") {
    return withSetCookies(null, clearedCookies(), { status: 204 });
  }
  return new Response("not found", { status: 404 });
}

// simple in-memory store for boat dimensions since mock users are static
const MOCK_DIMENSIONS = new Map<string, { length?: number; width?: number; depth?: number }>();

async function handleUsers(req: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (path === "/api/users/me" && req.method === "PATCH") {
    if (!hasAccessCookie(req)) return unauthorized();
    
    const isVisitor = req.headers.get("cookie")?.includes("visitor%40example.com") || false;
    const userId = isVisitor ? "u-mock-visitor" : "u-mock-harbormaster";
    
    const body = await req.json();
    const dims = MOCK_DIMENSIONS.get(userId) || {};
    
    if (body.boat_length_m !== undefined) dims.length = body.boat_length_m;
    if (body.boat_width_m !== undefined) dims.width = body.boat_width_m;
    if (body.boat_depth_m !== undefined) dims.depth = body.boat_depth_m;
    
    MOCK_DIMENSIONS.set(userId, dims);
    
    const baseUser = isVisitor 
      ? { ...MOCK_USER, role: "visitor", email: "visitor@example.com", user_id: "u-mock-visitor" }
      : MOCK_USER;

    const updatedUser = {
      ...baseUser,
      boat_length_m: dims.length,
      boat_width_m: dims.width,
      boat_depth_m: dims.depth,
      // also handle other profile fields if present in body
      firstname: body.firstname || baseUser.firstname,
      lastname: body.lastname || baseUser.lastname,
      email: body.email || baseUser.email,
    };

    return new Response(JSON.stringify(updatedUser), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
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

function handleBerthWindows(req: Request, url: URL): Response | null {
  const match = url.pathname.match(/^\/api\/berths\/([^/]+)\/bookable-windows$/);
  if (!match || req.method !== "GET") return null;

  const berthId = match[1];
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const nextWeek = new Date(now.getTime() + 86400000 * 7);

  // return two windows for any berth requested
  return new Response(
    JSON.stringify([
      {
        window_id: `win-${berthId}-1`,
        berth_id: berthId,
        from_date: tomorrow.toISOString(),
        to_date: new Date(tomorrow.getTime() + 86400000 * 2).toISOString(),
      },
      {
        window_id: `win-${berthId}-2`,
        berth_id: berthId,
        from_date: nextWeek.toISOString(),
        to_date: new Date(nextWeek.getTime() + 86400000 * 3).toISOString(),
      },
    ]),
    { headers: { "Content-Type": "application/json" } },
  );
}

type MockBooking = {
  booking_id: string;
  berth_id: string;
  visitor_id: string;
  from_date: string;
  to_date: string;
  status: "confirmed" | "cancelled_by_visitor" | "cancelled_by_host" | "completed";
  created_at: string;
};

const mockBookings = new Map<string, MockBooking>();

function getMockUserId(req: Request): string {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.match(/dockpulse_mock_user=([^;]+)/);
  if (!match) return "u-mock-anonymous";
  const email = decodeURIComponent(match[1]);
  return email === "visitor@example.com" ? "u-mock-visitor" : "u-mock-harbormaster";
}

async function handleBookings(req: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  
  // POST /api/berths/{id}/bookings:preflight
  const preflightMatch = path.match(/^\/api\/berths\/([^/]+)\/bookings:preflight$/);
  if (preflightMatch && req.method === "POST") {
    if (!hasAccessCookie(req)) return unauthorized();
    
    const body = await req.json();
    const berthId = preflightMatch[1];
    const berth = BERTHS.find(b => b.berth_id === berthId) || BERTHS[0];
    
    const reasons: string[] = [];
    let fits = true;
    
    if (body.length_m && body.length_m > (berth.length_m || 8.5)) {
      fits = false;
      reasons.push(`Boat length (${body.length_m}m) exceeds berth length (${berth.length_m || 8.5}m)`);
    }
    if (body.width_m && body.width_m > (berth.width_m || 3.2)) {
      fits = false;
      reasons.push(`Boat width (${body.width_m}m) exceeds berth width (${berth.width_m || 3.2}m)`);
    }
    if (body.depth_m && body.depth_m > (berth.depth_m || 2.0)) {
      fits = false;
      reasons.push(`Boat depth (${body.depth_m}m) exceeds berth depth (${berth.depth_m || 2.0}m)`);
    }

    return new Response(JSON.stringify({ available: true, fits, reasons }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/berths/{id}/bookings
  const createMatch = path.match(/^\/api\/berths\/([^/]+)\/bookings$/);
  if (createMatch && req.method === "POST") {
    if (!hasAccessCookie(req)) return unauthorized();
    const berthId = createMatch[1];
    const body = await req.json();
    const userId = getMockUserId(req);

    // simple overlap check for the same berth
    const hasOverlap = Array.from(mockBookings.values()).some(
      (b) =>
        b.berth_id === berthId &&
        b.status === "confirmed" &&
        ((body.from_date >= b.from_date && body.from_date < b.to_date) ||
          (body.to_date > b.from_date && body.to_date <= b.to_date))
    );

    if (hasOverlap) {
      return new Response(JSON.stringify({ detail: "Berth already booked for these dates." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    const booking: MockBooking = {
      booking_id: crypto.randomUUID(),
      berth_id: berthId,
      visitor_id: userId,
      from_date: body.from_date,
      to_date: body.to_date,
      status: "confirmed",
      created_at: new Date().toISOString(),
    };
    mockBookings.set(booking.booking_id, booking);
    return new Response(JSON.stringify(booking), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/bookings/me
  if (path === "/api/bookings/me" && req.method === "GET") {
    if (!hasAccessCookie(req)) return unauthorized();
    const userId = getMockUserId(req);
    const statusFilter = url.searchParams.get("status");
    
    const items = Array.from(mockBookings.values())
      .filter((b) => b.visitor_id === userId)
      .filter((b) => !statusFilter || b.status === statusFilter);

    return new Response(JSON.stringify(items), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // DELETE /api/bookings/{id}
  const deleteMatch = path.match(/^\/api\/bookings\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    if (!hasAccessCookie(req)) return unauthorized();
    const id = deleteMatch[1];
    const booking = mockBookings.get(id);
    if (!booking) return new Response(null, { status: 404 });
    
    if (booking.visitor_id !== getMockUserId(req)) {
      return new Response(JSON.stringify({ detail: "Forbidden" }), { status: 403 });
    }

    if (booking.status === "confirmed") {
      booking.status = "cancelled_by_visitor";
    } else {
      mockBookings.delete(id);
    }
    
    return new Response(null, { status: 204 });
  }

  return null;
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    console.log(`[MOCK] ${req.method} ${url.pathname}`);

    const authResponse = await handleAuth(req, url);
    if (authResponse) return authResponse;

    const userResponse = await handleUsers(req, url);
    if (userResponse) return userResponse;

    const adoptionResponse = await handleAdoptions(req, url);
    if (adoptionResponse) return adoptionResponse;

    const bookingResponse = await handleBookings(req, url);
    if (bookingResponse) return bookingResponse;

    const windowsResponse = handleBerthWindows(req, url);
    if (windowsResponse) return windowsResponse;

    if (url.pathname !== "/api/berths/stream") {
      return new Response("not found", { status: 404 });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // mirrors backend first frame, dev hook bootstraps off this
        controller.enqueue(
          encodeFrame("berth.snapshot", {
            type: "berth.snapshot",
            berths: BERTHS,
          }),
        );
        let i = 0;
        const tick = () => {
          const berth = BERTHS[i % BERTHS.length];
          i++;
          berth.status = berth.status === "free" ? "occupied" : "free";
          berth.is_available_now = berth.status === "free";
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

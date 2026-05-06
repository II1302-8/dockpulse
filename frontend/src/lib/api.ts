// double-submit csrf, server compares cookie to header on every non-safe method
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_COOKIE = "dockpulse_csrf";
const CSRF_HEADER = "X-CSRF-Token";

const LOGOUT_EVENT = "dockpulse:logged-out";

function readCsrfCookie(): string | null {
  for (const chunk of document.cookie.split(";")) {
    const [name, ...rest] = chunk.trim().split("=");
    if (name === CSRF_COOKIE) return rest.join("=") || null;
  }
  return null;
}

function withCsrfHeader(init: RequestInit | undefined): RequestInit {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  // string bodies are JSON.stringify output by convention here; default header
  // so callers can't trip pydantic's "body: Input should be a valid dict" by
  // forgetting the content type
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (SAFE_METHODS.has(method)) return { ...init, headers };
  const csrf = readCsrfCookie();
  if (csrf && !headers.has(CSRF_HEADER)) headers.set(CSRF_HEADER, csrf);
  return { ...init, headers };
}

let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  // shared promise so concurrent 401s only fire one /refresh
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: (() => {
          const csrf = readCsrfCookie();
          return csrf ? { [CSRF_HEADER]: csrf } : {};
        })(),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function dispatchLogout() {
  window.dispatchEvent(new CustomEvent(LOGOUT_EVENT));
}

export function onLoggedOut(handler: () => void): () => void {
  const wrapped = () => handler();
  window.addEventListener(LOGOUT_EVENT, wrapped);
  return () => window.removeEventListener(LOGOUT_EVENT, wrapped);
}

export interface ApiFetchOptions extends RequestInit {
  // skip the auto-refresh-on-401 dance, used by /refresh and /login themselves
  skipAuthRefresh?: boolean;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: ApiFetchOptions,
): Promise<Response> {
  const { skipAuthRefresh, ...rest } = init ?? {};
  const send = () =>
    fetch(input, {
      credentials: "include",
      ...withCsrfHeader(rest),
    });
  let res = await send();
  if (res.status !== 401 || skipAuthRefresh) return res;

  const refreshed = await performRefresh();
  if (!refreshed) {
    dispatchLogout();
    return res;
  }
  res = await send();
  if (res.status === 401) dispatchLogout();
  return res;
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: ApiFetchOptions,
): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) {
      return data.detail
        .map((err: { loc?: unknown[]; msg?: string }) => {
          const field = Array.isArray(err.loc) ? err.loc.at(-1) : null;
          return field ? `${field}: ${err.msg}` : err.msg;
        })
        .join(", ");
    }
    return res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

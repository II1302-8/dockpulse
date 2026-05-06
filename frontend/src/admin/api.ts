// cf access attaches the jwt at the edge so this is just same-origin fetch
// no cookies, no csrf dance

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    return res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api/admin${path}`, { ...init, headers });
  if (!res.ok) {
    throw new AdminApiError(res.status, await readError(res));
  }
  return res;
}

export async function adminGet<T>(path: string): Promise<T> {
  const res = await request(path, { method: "GET" });
  return (await res.json()) as T;
}

export async function adminPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await request(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // 204 means empty body, eg dismiss-pending
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function adminPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await request(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export async function adminDelete<T = void>(
  path: string,
  init?: { params?: Record<string, string> },
): Promise<T> {
  const qs = init?.params
    ? `?${new URLSearchParams(init.params).toString()}`
    : "";
  const res = await request(`${path}${qs}`, { method: "DELETE" });
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

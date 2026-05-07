// raw QR may be the bare base64url payload, or wrapped in a https://…?p=<payload> url
export function extractQrPayload(raw: string): string {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    for (const key of ["p", "q", "payload", "data"]) {
      const v = url.searchParams.get(key);
      if (v) return v.trim();
    }
    // fallback: last non-empty path segment
    const segs = url.pathname.split("/").filter(Boolean);
    return segs.at(-1) ?? trimmed;
  } catch {
    return trimmed;
  }
}

export type QrValidation = { ok: true } | { ok: false; reason: string };

export function validateQrPayload(raw: string): QrValidation {
  if (!raw) return { ok: false, reason: "Empty payload" };
  // base64url alphabet: A-Z a-z 0-9 - _ (padding optional)
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(raw)) {
    return { ok: false, reason: "Not a base64url payload (try rescanning)" };
  }
  try {
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(b64);
    const parsed = JSON.parse(decoded);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.jwt !== "string"
    ) {
      return { ok: false, reason: "QR missing 'jwt' field" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "QR content is not valid base64url JSON" };
  }
}

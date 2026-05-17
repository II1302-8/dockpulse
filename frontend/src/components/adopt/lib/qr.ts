// raw QR may be the bare serial:jti payload, or wrapped in a https://…?p=<payload> url
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

// sticker format: SERIAL:JTI (both >=1 char, jti is 16 uppercase hex by
// default but backend accepts any 8..64-char string for legacy compat)
const STICKER_RE = /^[A-Za-z0-9_.-]{1,64}:[A-Za-z0-9-]{8,64}$/;

export function validateQrPayload(raw: string): QrValidation {
  if (!raw) return { ok: false, reason: "Empty payload" };
  if (!STICKER_RE.test(raw)) {
    return {
      ok: false,
      reason: "Expected SERIAL:JTI (try rescanning the sticker)",
    };
  }
  return { ok: true };
}

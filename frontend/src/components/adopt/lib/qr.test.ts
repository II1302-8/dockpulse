import { describe, expect, test } from "vitest";
import { extractQrPayload, validateQrPayload } from "./qr";

// helper, build base64url(json) the same way the firmware emits QR bodies
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const validPayload = b64url({ jwt: "stub.jwt.token" });

describe("extractQrPayload", () => {
  test("returns bare payload unchanged", () => {
    expect(extractQrPayload(validPayload)).toBe(validPayload);
  });

  test("trims whitespace", () => {
    expect(extractQrPayload(`  ${validPayload}\n`)).toBe(validPayload);
  });

  test("pulls payload from ?p= query param", () => {
    const url = `https://dockpulse.xyz/q?p=${validPayload}`;
    expect(extractQrPayload(url)).toBe(validPayload);
  });

  test.each(["q", "payload", "data"])("pulls payload from ?%s=", (key) => {
    const url = `https://dockpulse.xyz/q?${key}=${validPayload}`;
    expect(extractQrPayload(url)).toBe(validPayload);
  });

  test("falls back to last path segment when no recognized query param", () => {
    const url = `https://dockpulse.xyz/adopt/${validPayload}`;
    expect(extractQrPayload(url)).toBe(validPayload);
  });

  test("returns trimmed input when URL parses but is empty path with no query", () => {
    expect(extractQrPayload("https://dockpulse.xyz/")).toBe(
      "https://dockpulse.xyz/",
    );
  });

  test("returns trimmed input on malformed URL", () => {
    // not http-prefixed, treated as bare
    const garbage = "not-a-url";
    expect(extractQrPayload(garbage)).toBe(garbage);
  });
});

describe("validateQrPayload", () => {
  test("accepts base64url JSON with jwt field", () => {
    expect(validateQrPayload(validPayload)).toEqual({ ok: true });
  });

  test("rejects empty string", () => {
    expect(validateQrPayload("")).toEqual({
      ok: false,
      reason: "Empty payload",
    });
  });

  test("rejects non-base64url alphabet (spaces, slash, plus)", () => {
    expect(validateQrPayload("has spaces").ok).toBe(false);
    expect(validateQrPayload("has/slash").ok).toBe(false);
    expect(validateQrPayload("has+plus").ok).toBe(false);
  });

  test("rejects payload missing jwt field", () => {
    const noJwt = b64url({ foo: "bar" });
    expect(validateQrPayload(noJwt)).toEqual({
      ok: false,
      reason: "QR missing 'jwt' field",
    });
  });

  test("rejects payload whose jwt is not a string", () => {
    const badJwt = b64url({ jwt: 123 });
    expect(validateQrPayload(badJwt)).toEqual({
      ok: false,
      reason: "QR missing 'jwt' field",
    });
  });

  test("rejects base64url that decodes to non-JSON", () => {
    const notJson = btoa("hello world")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(validateQrPayload(notJson)).toEqual({
      ok: false,
      reason: "QR content is not valid base64url JSON",
    });
  });

  test("rejects base64url that decodes to JSON null", () => {
    const nullJson = b64url(null);
    expect(validateQrPayload(nullJson)).toEqual({
      ok: false,
      reason: "QR missing 'jwt' field",
    });
  });

  test("accepts payload with extra fields alongside jwt", () => {
    const extra = b64url({ jwt: "x.y.z", v: 1, kid: "abc" });
    expect(validateQrPayload(extra)).toEqual({ ok: true });
  });
});

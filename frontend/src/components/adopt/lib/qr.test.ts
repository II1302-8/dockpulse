import { describe, expect, test } from "vitest";
import { extractQrPayload, validateQrPayload } from "./qr";

const validPayload = "DP-N-000123:94FF01A87262C5D8";

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

  test("returns trimmed input on non-url garbage", () => {
    expect(extractQrPayload("not-a-url")).toBe("not-a-url");
  });
});

describe("validateQrPayload", () => {
  test("accepts SERIAL:JTI", () => {
    expect(validateQrPayload(validPayload)).toEqual({ ok: true });
  });

  test("accepts legacy 36-char UUID jti", () => {
    expect(
      validateQrPayload("DP-N-000123:00000000-0000-4000-8000-000000000001"),
    ).toEqual({ ok: true });
  });

  test("rejects empty string", () => {
    expect(validateQrPayload("")).toEqual({
      ok: false,
      reason: "Empty payload",
    });
  });

  test("rejects payloads without a colon separator", () => {
    expect(validateQrPayload("DP-N-000123_94FF01A87262C5D8").ok).toBe(false);
  });

  test("rejects whitespace or unsupported characters", () => {
    expect(validateQrPayload("DP N:94FF01A87262C5D8").ok).toBe(false);
    expect(validateQrPayload("DP-N-000123:short").ok).toBe(false);
  });
});

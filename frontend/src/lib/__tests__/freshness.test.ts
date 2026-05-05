import { describe, expect, test } from "vitest";
import { isOnline, OFFLINE_THRESHOLD_MS } from "../freshness";

describe("isOnline", () => {
  const now = Date.parse("2026-05-05T12:00:00Z");

  test("returns false for null timestamp", () => {
    expect(isOnline(null, now)).toBe(false);
  });

  test("returns false for undefined timestamp", () => {
    expect(isOnline(undefined, now)).toBe(false);
  });

  test("returns false for unparseable timestamp", () => {
    expect(isOnline("not a date", now)).toBe(false);
  });

  test("returns true when within threshold", () => {
    const t = new Date(now - OFFLINE_THRESHOLD_MS + 1000).toISOString();
    expect(isOnline(t, now)).toBe(true);
  });

  test("returns false when at exactly the threshold", () => {
    const t = new Date(now - OFFLINE_THRESHOLD_MS).toISOString();
    expect(isOnline(t, now)).toBe(false);
  });

  test("returns false when older than threshold", () => {
    const t = new Date(now - OFFLINE_THRESHOLD_MS - 1).toISOString();
    expect(isOnline(t, now)).toBe(false);
  });

  test("respects custom threshold", () => {
    const t = new Date(now - 10_000).toISOString();
    expect(isOnline(t, now, 5_000)).toBe(false);
    expect(isOnline(t, now, 20_000)).toBe(true);
  });

  test("defaults now to current time", () => {
    const t = new Date().toISOString();
    expect(isOnline(t)).toBe(true);
  });
});

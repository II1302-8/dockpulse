import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useNow } from "../useNow";

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns current time initially", () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(Date.now());
  });

  test("ticks at the configured interval", () => {
    const { result } = renderHook(() => useNow(1000));
    const initial = result.current;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(initial + 1000);
  });

  test("uses 30s default interval", () => {
    const { result } = renderHook(() => useNow());
    const initial = result.current;
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current).toBe(initial);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(initial + 30_000);
  });

  test("clears interval on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() => useNow(1000));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});

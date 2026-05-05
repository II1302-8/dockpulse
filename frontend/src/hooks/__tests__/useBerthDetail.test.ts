import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { jsonResponse, makeBerth, mockFetch } from "../../test/helpers";
import { useBerthDetail } from "../useBerthDetail";

describe("useBerthDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("noop when berthId is null", () => {
    const fetchSpy = mockFetch(() => jsonResponse({}));
    const { result } = renderHook(() => useBerthDetail(null));
    expect(result.current.berth).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("fetches and stores berth", async () => {
    const berth = makeBerth({ berth_id: "B7" });
    mockFetch(() => jsonResponse(berth));
    const { result } = renderHook(() => useBerthDetail("B7"));
    await waitFor(() => expect(result.current.berth?.berth_id).toBe("B7"));
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  test("surfaces error on non-ok response", async () => {
    mockFetch(() => new Response("nope", { status: 500, statusText: "boom" }));
    const { result } = renderHook(() => useBerthDetail("B7"));
    await waitFor(() => expect(result.current.error).toMatch(/boom/));
    expect(result.current.berth).toBeNull();
  });

  test("clears state when berthId becomes null", async () => {
    mockFetch(() => jsonResponse(makeBerth()));
    const { result, rerender } = renderHook(({ id }) => useBerthDetail(id), {
      initialProps: { id: "B1" as string | null },
    });
    await waitFor(() => expect(result.current.berth).not.toBeNull());
    rerender({ id: null });
    expect(result.current.berth).toBeNull();
    expect(result.current.error).toBeNull();
  });

  test("polls every 15 minutes", async () => {
    vi.useFakeTimers();
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return jsonResponse(makeBerth({ battery_pct: calls }));
    });
    renderHook(() => useBerthDetail("B1"));
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });
    await vi.waitFor(() => expect(calls).toBe(2));
    vi.useRealTimers();
  });

  test("refetch triggers a new request", async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return jsonResponse(makeBerth());
    });
    const { result } = renderHook(() => useBerthDetail("B1"));
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await result.current.refetch();
    });
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

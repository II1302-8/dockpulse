import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getLastEventSource } from "../../test/eventSource";
import { jsonResponse, makeBerth, mockFetch } from "../../test/helpers";
import { useBerthsStream } from "../useBerthsStream";

describe("useBerthsStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("loads snapshot then exposes berths", async () => {
    const list = [makeBerth({ berth_id: "B1" }), makeBerth({ berth_id: "B2" })];
    mockFetch(() => jsonResponse(list));
    const { result } = renderHook(() => useBerthsStream());
    await waitFor(() => expect(result.current.berths).toHaveLength(2));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("surfaces snapshot error", async () => {
    mockFetch(() => new Response("", { status: 500, statusText: "boom" }));
    const { result } = renderHook(() => useBerthsStream());
    await waitFor(() => expect(result.current.error).toMatch(/boom/));
  });

  test("merges berth.update events into the map", async () => {
    mockFetch(() =>
      jsonResponse([makeBerth({ berth_id: "B1", status: "free" })]),
    );
    const { result } = renderHook(() => useBerthsStream());
    await waitFor(() => expect(result.current.berths).toHaveLength(1));

    const es = getLastEventSource();
    act(() => {
      es.emit("berth.update", {
        berth: makeBerth({ berth_id: "B1", status: "occupied" }),
      });
    });
    expect(result.current.berths[0].status).toBe("occupied");
  });

  test("ignores malformed event frames", async () => {
    mockFetch(() => jsonResponse([makeBerth()]));
    const { result } = renderHook(() => useBerthsStream());
    await waitFor(() => expect(result.current.berths).toHaveLength(1));
    const es = getLastEventSource();
    act(() => {
      es.emit("berth.update", "not json{");
    });
    expect(result.current.berths).toHaveLength(1);
  });

  test("reopen triggers re-snapshot after throttle window", async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return jsonResponse([makeBerth()]);
    });
    const { result } = renderHook(() => useBerthsStream());
    await waitFor(() => expect(calls).toBe(1));
    const es = getLastEventSource();

    // first onopen is the initial connection, no extra fetch
    act(() => es.emitOpen());
    expect(calls).toBe(1);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5000);
    act(() => es.emitOpen());
    vi.useRealTimers();

    await waitFor(() => expect(calls).toBe(2));
    expect(result.current.berths).toHaveLength(1);
  });

  test("closes EventSource on unmount", async () => {
    mockFetch(() => jsonResponse([makeBerth()]));
    const { result, unmount } = renderHook(() => useBerthsStream());
    await waitFor(() => expect(result.current.berths).toHaveLength(1));
    const es = getLastEventSource();
    unmount();
    expect(es.closed).toBe(true);
  });
});

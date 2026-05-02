import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { components } from "../api-types";

type Berth = components["schemas"]["BerthOut"];
type BerthEvent = components["schemas"]["BerthUpdateEvent"];

// Suppress snapshot storms on flaky reconnects.
const SNAPSHOT_THROTTLE_MS = 3000;

export function useBerthsStream() {
  const [berthsById, setBerthsById] = useState<Map<string, Berth>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const snapshotAbortRef = useRef<AbortController | null>(null);
  const lastSnapshotAtRef = useRef<number>(0);

  const loadSnapshotACB = useCallback(async () => {
    snapshotAbortRef.current?.abort();
    const ac = new AbortController();
    snapshotAbortRef.current = ac;
    try {
      const response = await fetch("/api/berths", { signal: ac.signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch berths: ${response.statusText}`);
      }
      const list = (await response.json()) as Berth[];
      if (ac.signal.aborted) return;
      setBerthsById(new Map(list.map((b) => [b.berth_id, b])));
      setError(null);
      lastSnapshotAtRef.current = Date.now();
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      if (!ac.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let hasOpenedOnce = false;
    loadSnapshotACB();

    const source = new EventSource("/api/berths/stream");

    source.addEventListener("berth.update", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as BerthEvent;
        setBerthsById((prev) => {
          const next = new Map(prev);
          next.set(msg.berth.berth_id, msg.berth);
          return next;
        });
      } catch {
        // ignore malformed frames
      }
    });

    source.onopen = () => {
      if (hasOpenedOnce) {
        const sinceLast = Date.now() - lastSnapshotAtRef.current;
        if (sinceLast >= SNAPSHOT_THROTTLE_MS) loadSnapshotACB();
      }
      hasOpenedOnce = true;
    };

    return () => {
      source.close();
      snapshotAbortRef.current?.abort();
    };
  }, [loadSnapshotACB]);

  const berths = useMemo(() => Array.from(berthsById.values()), [berthsById]);

  return {
    berths,
    isLoading,
    error,
    refetchACB: loadSnapshotACB,
  };
}

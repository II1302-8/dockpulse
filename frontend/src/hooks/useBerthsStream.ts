import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { components } from "../api-types";

type Berth = components["schemas"]["Berth"];
type BerthEvent = components["schemas"]["BerthEvent"];

export function useBerthsStream() {
  const [berthsById, setBerthsById] = useState<Map<string, Berth>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const snapshotAbortRef = useRef<AbortController | null>(null);

  const loadSnapshot = useCallback(async () => {
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
    loadSnapshot();

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
        // Reconnect: stream gap may have dropped events. Re-sync via snapshot.
        loadSnapshot();
      }
      hasOpenedOnce = true;
    };

    return () => {
      source.close();
      snapshotAbortRef.current?.abort();
    };
  }, [loadSnapshot]);

  const berths = useMemo(() => Array.from(berthsById.values()), [berthsById]);

  return {
    berths,
    isLoading,
    error,
    refetch: loadSnapshot,
  };
}

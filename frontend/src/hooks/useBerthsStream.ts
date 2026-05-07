import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { components } from "../api-types";

type Berth = components["schemas"]["BerthOut"];
type BerthEvent = components["schemas"]["BerthUpdateEvent"];
type BerthSnapshot = components["schemas"]["BerthSnapshotEvent"];

export function useBerthsStream() {
  const [berthsById, setBerthsById] = useState<Map<string, Berth>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // bump to force the EventSource effect to tear down + reopen
  const [generation, setGeneration] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // generation read so the dep array re-runs the effect on retry
    void generation;
    const source = new EventSource("/api/berths/stream");
    sourceRef.current = source;

    source.addEventListener("berth.snapshot", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as BerthSnapshot;
        setBerthsById(new Map(msg.berths.map((b) => [b.berth_id, b])));
        setError(null);
        setIsLoading(false);
      } catch {
        // ignore malformed frames
      }
    });

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

    source.onerror = () => {
      // soft error for retry UI, snapshot on reconnect clears it
      if (source.readyState === EventSource.CLOSED) {
        setError("Stream connection closed");
      } else if (source.readyState === EventSource.CONNECTING) {
        setError("Stream reconnecting");
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [generation]);

  const refetchACB = useCallback(() => {
    setIsLoading(true);
    setGeneration((g) => g + 1);
  }, []);

  const berths = useMemo(() => Array.from(berthsById.values()), [berthsById]);

  return {
    berths,
    isLoading,
    error,
    refetchACB,
  };
}

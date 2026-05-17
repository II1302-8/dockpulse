import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { components } from "../api-types";

type Berth = components["schemas"]["BerthOut"];
type BerthEvent = components["schemas"]["BerthUpdateEvent"];
type BerthSnapshot = components["schemas"]["BerthSnapshotEvent"];

// EventSource won't auto-retry on clean server close, schedule own backoff
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;
// quiet the reconnect banner unless the outage actually persists past this
const ERROR_SURFACE_MS = 2500;

export function useBerthsStream(harborId: string | null) {
  const [berthsById, setBerthsById] = useState<Map<string, Berth>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // bump to force the EventSource effect to tear down + reopen
  const [generation, setGeneration] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);

  useEffect(() => {
    // generation read so the dep array re-runs the effect on retry
    void generation;
    if (!harborId) {
      setIsLoading(false);
      return;
    }
    const source = new EventSource(
      `/api/berths/stream?harbor_id=${encodeURIComponent(harborId)}`,
    );
    sourceRef.current = source;

    const scheduleRetry = () => {
      if (retryTimerRef.current) return;
      const attempt = retryAttemptRef.current;
      const delay = Math.min(
        RETRY_BASE_MS * 2 ** attempt + Math.random() * 250,
        RETRY_MAX_MS,
      );
      retryAttemptRef.current = attempt + 1;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setGeneration((g) => g + 1);
      }, delay);
    };

    const cancelPendingError = () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };

    source.addEventListener("berth.snapshot", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as BerthSnapshot;
        setBerthsById(new Map(msg.berths.map((b) => [b.berth_id, b])));
        cancelPendingError();
        setError(null);
        setIsLoading(false);
        // fresh snapshot = healthy, reset backoff
        retryAttemptRef.current = 0;
      } catch {
        // malformed frame, skip
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
        // malformed frame, skip
      }
    });

    // server dropped at least one event for us, re-open for a fresh snapshot
    source.addEventListener("stream.stale", () => {
      source.close();
      retryAttemptRef.current = 0;
      scheduleRetry();
    });

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        // delay the banner so brief tab-switch closes don't flash a warning,
        // cancel if the reconnect succeeds before the timer fires
        if (!errorTimerRef.current) {
          errorTimerRef.current = setTimeout(() => {
            errorTimerRef.current = null;
            setError("Stream connection closed, retrying...");
          }, ERROR_SURFACE_MS);
        }
        scheduleRetry();
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      cancelPendingError();
    };
  }, [generation, harborId]);

  // when the tab regains focus, force a fresh reconnect, ios safari often
  // closes the EventSource silently on tab hide so without this the page
  // sits showing stale data until the next user action
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      retryAttemptRef.current = 0;
      setGeneration((g) => g + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const refetchACB = useCallback(() => {
    setIsLoading(true);
    retryAttemptRef.current = 0;
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

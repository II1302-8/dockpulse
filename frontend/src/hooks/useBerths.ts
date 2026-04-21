import { useCallback, useEffect, useRef, useState } from "react";
import type { components } from "../api-types";

type Berth = components["schemas"]["Berth"];

const BASE_INTERVAL_MS = 5000;
const MAX_INTERVAL_MS = 30000;

export function useBerths() {
  const [berths, setBerths] = useState<Berth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const failureCountRef = useRef(0);

  const fetchBerths = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const response = await fetch("/api/berths", { signal: ac.signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch berths: ${response.statusText}`);
      }
      const data = (await response.json()) as Berth[];
      if (ac.signal.aborted) return;
      setBerths(data);
      setError(null);
      failureCountRef.current = 0;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      console.error("useBerths fetch failed", err);
      failureCountRef.current += 1;
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      if (!ac.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
      if (cancelled || document.hidden) return;
      const delay = Math.min(
        BASE_INTERVAL_MS * 2 ** failureCountRef.current,
        MAX_INTERVAL_MS,
      );
      timerId = setTimeout(async () => {
        timerId = undefined;
        if (cancelled) return;
        await fetchBerths();
        scheduleNext();
      }, delay);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (timerId) {
          clearTimeout(timerId);
          timerId = undefined;
        }
      } else if (!timerId) {
        fetchBerths().then(scheduleNext);
      }
    };

    fetchBerths().then(scheduleNext);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchBerths]);

  return {
    berths,
    isLoading,
    error,
    refetch: fetchBerths,
  };
}

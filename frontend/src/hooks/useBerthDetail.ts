import { useCallback, useEffect, useRef, useState } from "react";
import type { components } from "../api-types";

type Berth = components["schemas"]["Berth"];

const POLL_INTERVAL_MS = 15 * 60 * 1000;

export function useBerthDetail(berthId: string | null) {
  const [berth, setBerth] = useState<Berth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchBerth = useCallback(async () => {
    if (!berthId) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/berths/${berthId}`, {
        signal: ac.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch berth details: ${response.statusText}`,
        );
      }
      const data = (await response.json()) as Berth;
      if (ac.signal.aborted) return;
      setBerth(data);
      setError(null);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      if (!ac.signal.aborted) setIsLoading(false);
    }
  }, [berthId]);

  useEffect(() => {
    if (!berthId) {
      abortRef.current?.abort();
      setBerth(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setBerth(null);
    setError(null);
    fetchBerth();
    const interval = setInterval(fetchBerth, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [berthId, fetchBerth]);

  return {
    berth,
    isLoading,
    error,
    refetch: fetchBerth,
  };
}

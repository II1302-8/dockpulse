import { useCallback, useEffect, useRef, useState } from "react";
import type { components } from "../api-types";

type Berth = components["schemas"]["Berth"];

const BERTHS_ENDPOINT = "/api/berths";
const BERTH_EVENTS_ENDPOINT = "/api/berths/events";

export function useBerths() {
  const [berths, setBerths] = useState<Berth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchBerths = useCallback(async () => {
    abortRef.current?.abort();

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const response = await fetch(BERTHS_ENDPOINT, {
        signal: ac.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch berths: ${response.statusText}`);
      }

      const data = (await response.json()) as Berth[];

      if (ac.signal.aborted) return;

      setBerths(data);
      setError(null);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;

      console.error("useBerths fetch failed", err);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      if (!ac.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchBerths();

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchBerths]);

  useEffect(() => {
    const eventSource = new EventSource(BERTH_EVENTS_ENDPOINT);

    eventSource.onopen = () => {
      setError(null);

      // Important after reconnect:
      // fetch the full current state so missed events do not leave stale UI.
      fetchBerths();
    };

    eventSource.onmessage = (event) => {
      try {
        const updatedBerth = JSON.parse(event.data) as Partial<Berth>;

        if (!updatedBerth.berth_id) return;

        setBerths((currentBerths) => {
          const berthExists = currentBerths.some(
            (berth) => berth.berth_id === updatedBerth.berth_id,
          );

          if (!berthExists) {
            return [...currentBerths, updatedBerth as Berth];
          }

          return currentBerths.map((berth) =>
            berth.berth_id === updatedBerth.berth_id
              ? { ...berth, ...updatedBerth }
              : berth,
          );
        });
      } catch (err) {
        console.error("Invalid berth SSE payload", err);
      }
    };

    eventSource.onerror = () => {
      console.warn("Berth SSE connection lost. Browser will retry.");

      // Keep the dashboard fresh during short network blips.
      fetchBerths();
    };

    return () => {
      eventSource.close();
    };
  }, [fetchBerths]);

  return {
    berths,
    isLoading,
    error,
    refetch: fetchBerths,
  };
}

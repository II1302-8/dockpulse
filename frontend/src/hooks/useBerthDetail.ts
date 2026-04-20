import { useCallback, useEffect, useState } from "react";
import type { components } from "../api-types";

type Berth = components["schemas"]["Berth"];

export function useBerthDetail(berthId: string | null) {
  const [berth, setBerth] = useState<Berth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBerthACB = useCallback(async () => {
    if (!berthId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/berths/${berthId}`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch berth details: ${response.statusText}`,
        );
      }
      const data = await response.json();
      setBerth(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  }, [berthId]);

  useEffect(
    function fetchBerthDetailEffect() {
      if (!berthId) {
        setBerth(null);
        return;
      }

      // Initial fetch
      fetchBerthACB();

      // Slow poll for details (e.g., battery) every 15 minutes
      const interval = setInterval(fetchBerthACB, 15 * 60 * 1000);

      return () => clearInterval(interval);
    },
    [berthId, fetchBerthACB],
  );

  return {
    berth,
    isLoading,
    error,
    refetch: fetchBerthACB,
  };
}

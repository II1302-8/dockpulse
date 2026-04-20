import { useCallback, useEffect, useState } from "react";
import type { components } from "../api-types";

type Berth = components["schemas"]["Berth"];

export function useBerths() {
  const [berths, setBerths] = useState<Berth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBerthsACB = useCallback(async () => {
    try {
      const response = await fetch("/api/berths");
      if (!response.ok) {
        throw new Error(`Failed to fetch berths: ${response.statusText}`);
      }
      const data = await response.json();
      setBerths(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(
    function pollingEffect() {
      // Initial fetch
      fetchBerthsACB();

      // Set up polling interval (5 seconds)
      const intervalId = setInterval(fetchBerthsACB, 5000);

      // Cleanup on unmount
      return () => clearInterval(intervalId);
    },
    [fetchBerthsACB],
  );

  return {
    berths,
    isLoading,
    error,
    refetch: fetchBerthsACB,
  };
}

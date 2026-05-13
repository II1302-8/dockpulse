import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export type BookableWindow = {
  window_id: string;
  berth_id: string;
  from_date: string;
  to_date: string;
};

interface UseBookableWindowsResult {
  windows: BookableWindow[];
  isLoading: boolean;
  error: string | null;
}

export function useBookableWindows(
  berthId: string | null,
): UseBookableWindowsResult {
  const [windows, setWindows] = useState<BookableWindow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!berthId) {
      setWindows([]);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    apiFetch(`/api/berths/${berthId}/bookable-windows`, { signal: ac.signal })
      .then((res) => (res.ok ? (res.json() as Promise<BookableWindow[]>) : []))
      .then((data) => {
        if (!ac.signal.aborted) setWindows(data);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        console.error("Failed to fetch bookable windows", err);
        setError("Could not load bookable windows.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoading(false);
      });

    return () => ac.abort();
  }, [berthId]);

  return { windows, isLoading, error };
}

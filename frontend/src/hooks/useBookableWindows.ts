import { useEffect, useState } from "react";
import type { components } from "../api-types";
import { apiFetch } from "../lib/api";

export type BookedRange = components["schemas"]["BookedRange"];
export type BookableWindow = components["schemas"]["BookableWindowOut"];

interface UseBookableWindowsResult {
  windows: BookableWindow[];
  isLoading: boolean;
  error: string | null;
}

export function useBookableWindows(
  berthId: string | null,
  options: { from?: string; to?: string } = {},
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

    const params = new URLSearchParams();
    if (options.from) params.append("from", options.from);
    if (options.to) params.append("to", options.to);
    const query = params.toString() ? `?${params.toString()}` : "";

    apiFetch(`/api/berths/${berthId}/bookable-windows${query}`, {
      signal: ac.signal,
    })
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
  }, [berthId, options.from, options.to]);

  return { windows, isLoading, error };
}

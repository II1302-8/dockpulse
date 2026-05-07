import { useEffect, useState } from "react";
import type { components } from "../api-types";
import { ApiError, apiJson } from "../lib/api";

type Berth = components["schemas"]["BerthOut"];

interface UseFreeBerthsResult {
  berths: Berth[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFreeBerths(dockId: string): UseFreeBerthsResult {
  const [berths, setBerths] = useState<Berth[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick triggers refetch
  useEffect(() => {
    const ac = new AbortController();
    setIsLoading(true);
    setError(null);
    apiJson<Berth[]>(
      `/api/berths?dock_id=${encodeURIComponent(dockId)}&status=free`,
      { signal: ac.signal },
    )
      .then((data) => {
        if (ac.signal.aborted) return;
        setBerths(data);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (err instanceof ApiError) setError(err.message);
        else if (err instanceof Error) setError(err.message);
        else setError("Failed to load berths");
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoading(false);
      });
    return () => ac.abort();
  }, [dockId, tick]);

  return { berths, isLoading, error, refetch: () => setTick((n) => n + 1) };
}

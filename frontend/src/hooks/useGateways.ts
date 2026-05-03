import { useEffect, useState } from "react";
import type { components } from "../api-types";
import { ApiError, apiJson } from "../lib/api";

type Gateway = components["schemas"]["GatewayOut"];

interface UseGatewaysResult {
  gateways: Gateway[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGateways(
  opts: { onlyOnline?: boolean } = {},
): UseGatewaysResult {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick triggers refetch
  useEffect(() => {
    const ac = new AbortController();
    setIsLoading(true);
    setError(null);
    const qs = opts.onlyOnline ? "?status=online" : "";
    apiJson<Gateway[]>(`/api/gateways${qs}`, { signal: ac.signal })
      .then((data) => {
        if (ac.signal.aborted) return;
        setGateways(data);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (err instanceof ApiError) setError(err.message);
        else if (err instanceof Error) setError(err.message);
        else setError("Failed to load gateways");
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoading(false);
      });
    return () => ac.abort();
  }, [opts.onlyOnline, tick]);

  return { gateways, isLoading, error, refetch: () => setTick((n) => n + 1) };
}

import { useCallback, useEffect, useState } from "react";
import type { components } from "../api-types";
import { apiFetch } from "../lib/api";

export type Alert = components["schemas"]["AlertOut"];

const POLL_INTERVAL_MS = 30_000;

export function useActiveAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/alerts?acknowledged=false");
      if (!res.ok) {
        // 401/403 happens for non-harbormaster users; stay quiet, don't error
        if (res.status === 401 || res.status === 403) {
          setAlerts([]);
          return;
        }
        setError(`Could not load alerts (status ${res.status}).`);
        return;
      }
      setAlerts((await res.json()) as Alert[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load alerts.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    // optimistic: drop from the local list immediately
    setAlerts((prev) => prev.filter((a) => a.alert_id !== alertId));
    try {
      await apiFetch(`/api/alerts/${alertId}/acknowledge`, { method: "POST" });
    } catch (err) {
      console.warn("Failed to acknowledge alert", err);
    }
  }, []);

  return { alerts, isLoading, error, acknowledgeAlert, refresh: load };
}

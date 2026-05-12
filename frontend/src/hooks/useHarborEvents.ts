import { useCallback, useEffect, useState } from "react";
import type { components } from "../api-types";
import { apiFetch } from "../lib/api";

export type HarborEvent = components["schemas"]["EventOut"];

export interface UseHarborEventsOptions {
  page: number;
  pageSize: number;
  eventTypes?: string[] | null;
  enabled?: boolean;
}

type ListResponse = {
  items: HarborEvent[];
  total: number;
};

async function readError(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return data.detail || data.message || data.error || fallback;
  } catch {
    return fallback;
  }
}

export function useHarborEvents(
  harborId: string | null | undefined,
  { page, pageSize, eventTypes, enabled = true }: UseHarborEventsOptions,
) {
  const [items, setItems] = useState<HarborEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!harborId || !enabled) return;

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String((page - 1) * pageSize));
    if (eventTypes) {
      for (const t of eventTypes) params.append("event_type", t);
    }

    try {
      const res = await apiFetch(
        `/api/harbors/${harborId}/events?${params.toString()}`,
      );
      if (!res.ok) {
        throw new Error(await readError(res, "Could not load events."));
      }
      const data = (await res.json()) as ListResponse;
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load events.");
    } finally {
      setIsLoading(false);
    }
  }, [harborId, enabled, page, pageSize, eventTypes]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, total, isLoading, error, refresh: load };
}

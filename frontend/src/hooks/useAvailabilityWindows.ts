import { useEffect, useState } from "react";
import {
  type AvailabilityForm,
  getErrorsFromResponse,
} from "../components/settings/lib/validation";
import { apiFetch } from "../lib/api";

export type AvailabilityWindow = {
  window_id: string;
  berth_id: string;
  user_id: string;
  from_date: string;
  return_date: string;
  created_at: string;
};

type CreateResult =
  | { ok: true; window: AvailabilityWindow }
  | { ok: false; error: string };

type RemoveResult = { ok: true } | { ok: false; error: string };

interface UseAvailabilityWindowsResult {
  windows: AvailabilityWindow[];
  isLoading: boolean;
  loadError: string | null;
  isCreating: boolean;
  removingId: string | null;
  create: (form: AvailabilityForm) => Promise<CreateResult>;
  remove: (windowId: string) => Promise<RemoveResult>;
}

// input[type=date] yields YYYY-MM-DD, backend wants ISO datetime so anchor at UTC midnight
function dateInputToIso(value: string): string {
  return `${value}T00:00:00Z`;
}

export function useAvailabilityWindows(
  berthId: string | null,
): UseAvailabilityWindowsResult {
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!berthId) {
      setWindows([]);
      setLoadError(null);
      return;
    }

    const ac = new AbortController();
    setIsLoading(true);
    setLoadError(null);

    apiFetch(`/api/berths/${berthId}/availability`, { signal: ac.signal })
      .then((res) =>
        res.ok ? (res.json() as Promise<AvailabilityWindow[]>) : [],
      )
      .then((data) => {
        if (!ac.signal.aborted) setWindows(data);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setLoadError("Could not load existing availability windows.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoading(false);
      });

    return () => ac.abort();
  }, [berthId]);

  async function create(form: AvailabilityForm): Promise<CreateResult> {
    if (!berthId) {
      return {
        ok: false,
        error: "No assigned berth was found for your account.",
      };
    }

    setIsCreating(true);
    try {
      const res = await apiFetch(`/api/berths/${berthId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_date: dateInputToIso(form.from_date),
          return_date: dateInputToIso(form.return_date),
        }),
      });

      if (!res.ok) {
        const responseErrors = await getErrorsFromResponse(
          res,
          "Could not save berth availability.",
        );
        return {
          ok: false,
          error:
            responseErrors.general ??
            "Could not save berth availability. Please try again.",
        };
      }

      const saved = (await res.json()) as AvailabilityWindow;
      setWindows((prev) =>
        [...prev, saved].sort((a, b) => a.from_date.localeCompare(b.from_date)),
      );
      return { ok: true, window: saved };
    } catch {
      return {
        ok: false,
        error: "Could not save berth availability. Please try again.",
      };
    } finally {
      setIsCreating(false);
    }
  }

  async function remove(windowId: string): Promise<RemoveResult> {
    if (!berthId) {
      return {
        ok: false,
        error: "No assigned berth was found for your account.",
      };
    }

    setRemovingId(windowId);
    try {
      const res = await apiFetch(
        `/api/berths/${berthId}/availability/${windowId}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const responseErrors = await getErrorsFromResponse(
          res,
          "Could not clear berth availability.",
        );
        return {
          ok: false,
          error:
            responseErrors.general ??
            "Could not clear berth availability. Please try again.",
        };
      }

      setWindows((prev) => prev.filter((w) => w.window_id !== windowId));
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: "Could not clear berth availability. Please try again.",
      };
    } finally {
      setRemovingId(null);
    }
  }

  return {
    windows,
    isLoading,
    loadError,
    isCreating,
    removingId,
    create,
    remove,
  };
}

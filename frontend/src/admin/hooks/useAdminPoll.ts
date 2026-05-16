import { useEffect, useRef } from "react";

// visibility-aware polling, pauses ticks when the tab is hidden so an
// idle laptop doesn't hammer the backend admin endpoints
export function useAdminPoll(
  fn: () => void | Promise<void>,
  intervalMs: number,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (typeof document === "undefined") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        try {
          await fnRef.current();
        } catch {
          // upstream surfaces its own error state, swallow here
        }
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };

    timer = setTimeout(tick, intervalMs);

    // when the tab becomes visible again, fire immediately instead of
    // waiting out the remaining interval
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        timer = setTimeout(tick, 0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}

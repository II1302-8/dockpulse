import { useEffect, useRef } from "react";

/**
 * Re-fires `callback` every `intervalMs` while the tab is visible. Caller is
 * responsible for the initial invocation; this hook only owns the recurring
 * tick. Skips firing while document.visibilityState !== "visible" so a hidden
 * tab doesn't burn requests.
 */
export function usePolling(
  callback: () => void,
  intervalMs: number,
  enabled: boolean = true,
): void {
  const cbRef = useRef(callback);
  // keep latest callback without re-installing the interval
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") cbRef.current();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
}

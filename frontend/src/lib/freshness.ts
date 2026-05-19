export const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

export function isOnline(
  lastUpdated: string | null | undefined,
  now: number = Date.now(),
  thresholdMs: number = OFFLINE_THRESHOLD_MS,
): boolean {
  if (!lastUpdated) return false;
  const t = Date.parse(lastUpdated);
  if (Number.isNaN(t)) return false;
  return now - t < thresholdMs;
}

// admin overrides count as "live" regardless of sensor freshness so a
// long-running pinned state doesn't decay into Disconnected at 5 min
export function isBerthLive(
  berth: { last_updated?: string | null; manual_status_active?: boolean },
  now: number = Date.now(),
): boolean {
  return (
    Boolean(berth.manual_status_active) || isOnline(berth.last_updated, now)
  );
}

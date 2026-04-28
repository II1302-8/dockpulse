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

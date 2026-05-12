import { useEffect, useRef, useState } from "react";
import type { components } from "../api-types";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type Berth = components["schemas"]["BerthOut"];

export interface ActivityEvent {
  id: string;
  timestamp: Date;
  type: "status_change" | "owner_assignment" | "alert";
  berthId: string;
  berthLabel: string;
  details: string;
  status?: string;
}

const STORAGE_KEY_PREFIX = "dockpulse_activity_log";

function storageKeyFor(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function useActivityLog(berths: Berth[], maxEvents: number) {
  const { user } = useAuth();
  const isLoaded = !!user && user.role !== undefined;
  const historyFetchedRef = useRef(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const prevBerthsRef = useRef<Map<string, Berth>>(new Map());

  const clearLog = () => {
    if (user?.user_id) {
      localStorage.removeItem(storageKeyFor(user.user_id));
      setEvents([]);
    }
  };

  // hydrate from per-user key once user is known
  useEffect(() => {
    if (!user?.user_id) return;
    const saved = localStorage.getItem(storageKeyFor(user.user_id));
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const hydrated = parsed.map((e: ActivityEvent) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }));
      // ensure we respect the limit of the current consumer (sidebar vs page)
      setEvents(hydrated.slice(0, maxEvents));
    } catch (err) {
      console.error("Failed to load activity log from localStorage", err);
    }
  }, [user?.user_id, maxEvents]);

  // persist to localStorage
  useEffect(() => {
    if (!user?.user_id) return;
    localStorage.setItem(storageKeyFor(user.user_id), JSON.stringify(events));
  }, [events, user?.user_id]);

  // fetch a small sample of berth history once per session
  useEffect(() => {
    if (!isLoaded || historyFetchedRef.current) return;
    if (berths.length === 0) return;
    historyFetchedRef.current = true;

    async function fetchInitialHistory() {
      // Prioritize berths that have been updated recently
      const sampleBerths = [...berths]
        .sort((a, b) => {
          const timeA = a.last_updated ? new Date(a.last_updated).getTime() : 0;
          const timeB = b.last_updated ? new Date(b.last_updated).getTime() : 0;
          return timeB - timeA;
        })
        .slice(0, 20);

      const results = await Promise.all(
        sampleBerths.map(async (berth) => {
          try {
            const res = await apiFetch(
              `/api/berths/${berth.berth_id}/events?limit=8`,
            );
            if (!res.ok) return [] as ActivityEvent[];
            const data = await res.json();
            return data.map(
              (ev: {
                event_id: string;
                timestamp: string;
                event_type: string;
              }) => ({
                id: ev.event_id,
                timestamp: new Date(ev.timestamp),
                type: "status_change" as const,
                berthId: berth.berth_id,
                berthLabel: berth.label || berth.berth_id,
                details: `Berth status was ${ev.event_type}`,
                status: ev.event_type,
              }),
            );
          } catch (err) {
            console.error(`Failed to fetch history for ${berth.berth_id}`, err);
            return [] as ActivityEvent[];
          }
        }),
      );

      const historyEvents = results.flat();
      if (historyEvents.length === 0) return;

      setEvents((prev) => {
        const seen = new Set<string>();
        return [...prev, ...historyEvents]
          .filter((e) => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
          })
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, maxEvents);
      });
    }

    fetchInitialHistory();
  }, [isLoaded, berths, maxEvents]);

  // diff live berth stream into synthetic events
  useEffect(() => {
    const newEvents: ActivityEvent[] = [];
    const currentBerths = new Map(berths.map((b) => [b.berth_id, b]));

    // skip first run, baseline only
    if (prevBerthsRef.current.size > 0) {
      for (const [id, berth] of currentBerths.entries()) {
        const prev = prevBerthsRef.current.get(id);
        if (!prev) continue;
        const prevUnavailable = prev.status === "occupied" || prev.is_reserved;
        const nextUnavailable =
          berth.status === "occupied" || berth.is_reserved;
        if (prevUnavailable !== nextUnavailable) {
          const fromLabel = prevUnavailable ? "Unavailable" : "Available";
          const toLabel = nextUnavailable ? "Unavailable" : "Available";
          newEvents.push({
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: "status_change",
            berthId: id,
            berthLabel: berth.label || id,
            details: `Status changed from ${fromLabel} to ${toLabel}`,
            status: berth.status,
          });
        }
        if (
          prev.assignment?.user_id !== berth.assignment?.user_id &&
          berth.assignment?.user_id
        ) {
          newEvents.push({
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: "owner_assignment",
            berthId: id,
            berthLabel: berth.label || id,
            details: `New owner assigned to berth`,
          });
        }
        if (
          (prev.battery_pct === null ||
            prev.battery_pct === undefined ||
            prev.battery_pct >= 15) &&
          berth.battery_pct !== null &&
          berth.battery_pct !== undefined &&
          berth.battery_pct < 15
        ) {
          newEvents.push({
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: "alert",
            berthId: id,
            berthLabel: berth.label || id,
            details: `Low battery alert: ${berth.battery_pct}%`,
            status: "alert_low_battery",
          });
        }
      }
    }

    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, maxEvents));
    }
    prevBerthsRef.current = currentBerths;
  }, [berths, maxEvents]);

  return { events, setEvents, isLoaded, clearLog };
}

import { Activity, Clock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { components } from "../api-types";
import { cn } from "../lib/utils";
import type { AuthOutletContext } from "./layout/MainLayout";

type Berth = components["schemas"]["BerthOut"];

interface ActivityEvent {
  id: string;
  timestamp: Date;
  type: "status_change" | "owner_assignment";
  berthId: string;
  berthLabel: string;
  details: string;
  status?: string;
}

interface ActivityLogPanelProps {
  berths: Berth[];
  isOpen?: boolean;
  onCloseCB?: () => void;
}

const STORAGE_KEY_PREFIX = "dockpulse_activity_log";

function storageKeyFor(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function ActivityLogPanel({
  berths,
  isOpen,
  onCloseCB,
}: ActivityLogPanelProps) {
  const { user, token } = useOutletContext<AuthOutletContext>();
  const isLoaded = !!user && user.role !== undefined;
  const isFirstLoad = useRef(true);
  const historyFetchedRef = useRef(false);

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const prevBerthsRef = useRef<Map<string, Berth>>(new Map());

  // hydrate from per-user key once user is known
  useEffect(() => {
    if (!user?.user_id) return;
    const saved = localStorage.getItem(storageKeyFor(user.user_id));
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setEvents(
        parsed.map((e: ActivityEvent) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        })),
      );
    } catch (err) {
      console.error("Failed to load activity log from localStorage", err);
    }
  }, [user?.user_id]);

  useEffect(() => {
    if (!user?.user_id) return;
    localStorage.setItem(storageKeyFor(user.user_id), JSON.stringify(events));
  }, [events, user?.user_id]);

  // first-paint flicker guard, panel uses isFirstLoad to skip transition on mount
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        isFirstLoad.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  // fetch a small sample of berth history once per session, not on every event
  useEffect(() => {
    if (!isLoaded || historyFetchedRef.current) return;
    if (berths.length === 0) return;
    historyFetchedRef.current = true;

    async function fetchInitialHistory() {
      const sampleBerths = berths.slice(0, 10);
      const results = await Promise.all(
        sampleBerths.map(async (berth) => {
          try {
            const res = await fetch(
              `/api/berths/${berth.berth_id}/events?limit=5`,
              { headers: { Authorization: `Bearer ${token}` } },
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
          .slice(0, 100);
      });
    }

    fetchInitialHistory();
  }, [isLoaded, berths, token]);

  // diff live berth stream into synthetic events
  useEffect(() => {
    const newEvents: ActivityEvent[] = [];
    const currentBerths = new Map(berths.map((b) => [b.berth_id, b]));

    // skip first run, baseline only
    if (prevBerthsRef.current.size > 0) {
      for (const [id, berth] of currentBerths.entries()) {
        const prev = prevBerthsRef.current.get(id);
        if (!prev) continue;
        if (prev.status !== berth.status) {
          newEvents.push({
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: "status_change",
            berthId: id,
            berthLabel: berth.label || id,
            details: `Status changed from ${prev.status} to ${berth.status}`,
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
      }
    }

    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, 100));
    }
    prevBerthsRef.current = currentBerths;
  }, [berths]);

  const activeOpen = isOpen && isLoaded;
  const filteredEvents = events.filter((e) => {
    if (filterType === "all") return true;
    return e.type === filterType;
  });

  return (
    <section
      className={cn(
        "fixed bg-white/70 backdrop-blur-2xl border border-white/60 shadow-deep",
        "bottom-6 left-6 right-6 max-h-[60vh]",
        "lg:bottom-auto lg:right-auto lg:top-32 lg:w-80 lg:max-h-[calc(100vh-160px)] lg:left-[var(--sidebar-total-offset,32px)]",
        "flex flex-col z-[var(--z-panel)] p-6 font-body rounded-[32px] overflow-hidden transition-all duration-500 ease-in-out",
        (!isLoaded || isFirstLoad.current) &&
          "opacity-0 pointer-events-none transition-none",
        activeOpen
          ? "translate-y-0 opacity-100 pointer-events-auto lg:translate-x-0"
          : "translate-y-[150%] opacity-0 pointer-events-none lg:-translate-x-[150%] lg:translate-y-0",
      )}
    >
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-brand-blue" strokeWidth={2.5} />
          <h2 className="text-xs font-black text-[#0A2540]/40 uppercase tracking-[0.2em]">
            Activity Log
          </h2>
        </div>
        <button
          type="button"
          className="p-2 rounded-full bg-[#0A2540]/5 text-[#0A2540]/60 hover:bg-[#0A2540]/10 transition-colors"
          onClick={onCloseCB}
        >
          <X size={14} strokeWidth={3} />
        </button>
      </header>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
        {[
          { id: "all", label: "All" },
          { id: "status_change", label: "Status" },
          { id: "owner_assignment", label: "Owners" },
        ].map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => setFilterType(btn.id)}
            className={cn(
              "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              filterType === btn.id
                ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/20"
                : "bg-white/50 text-brand-navy/40 hover:bg-white/80",
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar no-scrollbar">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock size={32} className="text-brand-navy/10 mb-2" />
            <p className="text-[10px] font-bold text-brand-navy/30 uppercase tracking-widest">
              Waiting for activity...
            </p>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <article
              key={event.id}
              className="bg-white/80 border border-white/50 p-4 rounded-2xl shadow-subtle hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-brand-blue uppercase tracking-widest">
                  Berth {event.berthLabel}
                </span>
                <span className="text-[8px] font-bold text-brand-navy/30">
                  {event.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-[11px] font-bold text-brand-navy/70 leading-relaxed">
                {event.details}
              </p>
              {event.status && (
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      event.status === "occupied"
                        ? "bg-red-500 animate-pulse"
                        : "bg-emerald-500",
                    )}
                  />
                  <span className="text-[9px] font-black uppercase tracking-wider text-brand-navy/40">
                    {event.status}
                  </span>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

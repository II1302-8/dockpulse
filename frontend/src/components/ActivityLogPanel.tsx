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

const STORAGE_KEY = "dockpulse_activity_log";

export function ActivityLogPanel({
  berths,
  isOpen,
  onCloseCB,
}: ActivityLogPanelProps) {
  const { user, token } = useOutletContext<AuthOutletContext>();
  const isLoaded = !!user && user.role !== undefined;
  const isFirstLoad = useRef(true);

  // Initialize from localStorage
  const [events, setEvents] = useState<ActivityEvent[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return parsed.map((e: ActivityEvent) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }));
    } catch (err) {
      console.error("Failed to load activity log from localStorage", err);
      return [];
    }
  });

  const [filterType, setFilterType] = useState<string>("all");
  const prevBerthsRef = useRef<Map<string, Berth>>(new Map());

  // Save to localStorage whenever events change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  // Initial Snap/Hydration Guard
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        isFirstLoad.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  // Initial History Fetch (Fetch events for a subset of berths to populate the log)
  useEffect(() => {
    if (!isLoaded || events.length > 10) return;

    async function fetchInitialHistory() {
      // We fetch for the first 10 berths just to have some context
      const sampleBerths = berths.slice(0, 10);
      const historyEvents: ActivityEvent[] = [];

      for (const berth of sampleBerths) {
        try {
          const res = await fetch(`/api/berths/${berth.berth_id}/events?limit=5`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            for (const ev of data) {
              historyEvents.push({
                id: ev.event_id,
                timestamp: new Date(ev.timestamp),
                type: "status_change",
                berthId: berth.berth_id,
                berthLabel: berth.label || berth.berth_id,
                details: `Berth status was ${ev.event_type}`,
                status: ev.event_type,
              });
            }
          }
        } catch (err) {
          console.error(`Failed to fetch history for ${berth.berth_id}`, err);
        }
      }

      if (historyEvents.length > 0) {
        setEvents((prev) => {
          const combined = [...prev, ...historyEvents];
          // Simple deduplication by ID
          const seen = new Set();
          return combined
            .filter((e) => {
              if (seen.has(e.id)) return false;
              seen.add(e.id);
              return true;
            })
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 100);
        });
      }
    }

    fetchInitialHistory();
  }, [isLoaded, berths, events.length, token]); // Run once when loaded or if events are cleared

  // Detect live changes in berths to generate new events
  useEffect(() => {
    const newEvents: ActivityEvent[] = [];
    const currentBerths = new Map(berths.map((b) => [b.berth_id, b]));

    // Skip the very first run to avoid generating events for initial data
    if (prevBerthsRef.current.size > 0) {
      for (const [id, berth] of currentBerths.entries()) {
        const prev = prevBerthsRef.current.get(id);
        if (prev) {
          // Status change
          if (prev.status !== berth.status) {
            newEvents.push({
              id: `${id}-${Date.now()}-status`,
              timestamp: new Date(),
              type: "status_change",
              berthId: id,
              berthLabel: berth.label || id,
              details: `Status changed from ${prev.status} to ${berth.status}`,
              status: berth.status,
            });
          }
          // Assignment change
          if (prev.assignment?.user_id !== berth.assignment?.user_id) {
            if (berth.assignment?.user_id) {
              newEvents.push({
                id: `${id}-${Date.now()}-owner`,
                timestamp: new Date(),
                type: "owner_assignment",
                berthId: id,
                berthLabel: berth.label || id,
                details: `New owner assigned to berth`,
              });
            }
          }
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
        "fixed top-32 w-80 max-h-[calc(100vh-160px)] bg-white/70 backdrop-blur-2xl border border-white/60 shadow-deep",
        "left-[var(--sidebar-total-offset,32px)]",
        "flex flex-col z-[var(--z-panel)] p-6 font-body rounded-[32px] overflow-hidden transition-all duration-500 ease-in-out",
        (!isLoaded || isFirstLoad.current) && "opacity-0 pointer-events-none transition-none",
        activeOpen
          ? "translate-x-0 opacity-100 pointer-events-auto"
          : "-translate-x-[150%] opacity-0 pointer-events-none"
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
                : "bg-white/50 text-brand-navy/40 hover:bg-white/80"
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
                      event.status === "occupied" || event.status === "occupied"
                        ? "bg-red-500 animate-pulse"
                        : "bg-emerald-500"
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

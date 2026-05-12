import { Activity, Clock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { components } from "../api-types";
import { apiFetch } from "../lib/api";
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
  const { user } = useOutletContext<AuthOutletContext>();
  const isLoaded = !!user && user.role !== undefined;
  const isFirstLoad = useRef(true);
  const historyFetchedRef = useRef(false);

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const prevBerthsRef = useRef<Map<string, Berth>>(new Map());

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

  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        isFirstLoad.current = false;
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded || historyFetchedRef.current) return;
    if (berths.length === 0) return;

    historyFetchedRef.current = true;

    async function fetchInitialHistory() {
      const sampleBerths = berths.slice(0, 10);

      const results = await Promise.all(
        sampleBerths.map(async (berth) => {
          try {
            const res = await apiFetch(
              `/api/berths/${berth.berth_id}/events?limit=5`,
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
  }, [isLoaded, berths]);

  useEffect(() => {
    const newEvents: ActivityEvent[] = [];
    const currentBerths = new Map(berths.map((b) => [b.berth_id, b]));

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
            details: "New owner assigned to berth",
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

  function closePanel() {
    onCloseCB?.();
  }

  function handleCloseClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  }

  function handleClosePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleClosePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  }

  return (
    <section
      className={cn(
        "fixed z-[var(--z-panel)] flex flex-col overflow-hidden rounded-[32px] border border-white/60 bg-white/70 p-6 font-body shadow-deep backdrop-blur-2xl transition-all duration-500 ease-in-out",
        "bottom-[calc(env(safe-area-inset-bottom)+7rem)] left-6 right-6 max-h-[55dvh]",
        "lg:bottom-auto lg:right-auto lg:left-[var(--sidebar-total-offset,32px)] lg:top-32 lg:w-80 lg:max-h-[calc(100vh-160px)]",
        (!isLoaded || isFirstLoad.current) &&
          "pointer-events-none opacity-0 transition-none",
        activeOpen
          ? "pointer-events-auto translate-y-0 opacity-100 lg:translate-x-0"
          : "pointer-events-none translate-y-[150%] opacity-0 lg:-translate-x-[150%] lg:translate-y-0",
      )}
    >
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-brand-blue" strokeWidth={2.5} />
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#0A2540]/40">
            Activity Log
          </h2>
        </div>

        <button
          type="button"
          aria-label="Close activity log"
          onPointerDown={handleClosePointerDown}
          onPointerUp={handleClosePointerUp}
          onClick={handleCloseClick}
          className="pointer-events-auto relative z-[130] grid h-10 w-10 touch-manipulation cursor-pointer place-items-center rounded-full bg-[#0A2540]/5 text-[#0A2540]/60 transition-colors active:scale-95 active:bg-[#0A2540]/15"
        >
          <X size={16} strokeWidth={3} />
        </button>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-2">
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
              "min-w-0 rounded-full px-2 py-2 text-[9px] font-black uppercase tracking-wider transition-all sm:text-[10px]",
              filterType === btn.id
                ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/20"
                : "bg-white/50 text-brand-navy/40 hover:bg-white/80",
            )}
          >
            <span className="block truncate">{btn.label}</span>
          </button>
        ))}
      </div>

      <div className="custom-scrollbar no-scrollbar flex-1 space-y-3 overflow-y-auto pr-2">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock size={32} className="mb-2 text-brand-navy/10" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/30">
              Waiting for activity...
            </p>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <article
              key={event.id}
              className="rounded-2xl border border-white/50 bg-white/80 p-4 shadow-subtle transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 hover:shadow-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-blue">
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

              <p className="text-[11px] font-bold leading-relaxed text-brand-navy/70">
                {event.details}
              </p>

              {event.status && (
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      event.status === "occupied"
                        ? "animate-pulse bg-red-500"
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

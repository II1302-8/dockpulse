import { Clock, ExternalLink, Flag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { components } from "../api-types";
import { useActivityLog } from "../hooks/useActivityLog";
import { cn } from "../lib/utils";

type Berth = components["schemas"]["BerthOut"];

interface ActivityLogPanelProps {
  berths: Berth[];
  isOpen?: boolean;
  onCloseCB: () => void;
}

const PANEL_LIMIT = 25;

export function ActivityLogPanel({
  berths,
  isOpen,
  onCloseCB,
}: ActivityLogPanelProps) {
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  const { events, isLoaded } = useActivityLog(berths, PANEL_LIMIT);
  const isFirstLoad = useRef(true);
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        isFirstLoad.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  const activeOpen = isOpen && isLoaded;
  const filteredEvents = events.filter((e) => {
    if (filterType === "all") return true;
    return e.type === filterType;
  });

  function closePanel() {
    onCloseCB();
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
        "fixed border border-white/60 bg-white/70 shadow-deep backdrop-blur-2xl",
        "bottom-[calc(env(safe-area-inset-bottom)+7rem)] left-6 right-6 max-h-[55dvh]",
        "lg:bottom-auto lg:right-auto lg:left-[var(--sidebar-total-offset,32px)] lg:top-32 lg:w-80 lg:max-h-[calc(100vh-160px)]",
        "z-[var(--z-panel)] flex flex-col overflow-hidden rounded-[32px] p-6 font-body transition-all duration-500 ease-in-out",
        (!isLoaded || isFirstLoad.current) &&
          "pointer-events-none opacity-0 transition-none",
        activeOpen
          ? "pointer-events-auto translate-y-0 opacity-100 lg:translate-x-0"
          : "pointer-events-none translate-y-[150%] opacity-0 lg:-translate-x-[150%] lg:translate-y-0",
      )}
    >
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flag size={16} className="text-brand-blue" strokeWidth={2.5} />
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#0A2540]/40">
            Activity Log
          </h2>
          {marinaSlug && (
            <Link
              to={`/${marinaSlug}/activity`}
              className="ml-1 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-brand-blue/60 transition-colors hover:text-brand-blue"
            >
              <span>Full log</span>
              <ExternalLink size={10} strokeWidth={2.5} />
            </Link>
          )}
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

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "status_change", "owner_assignment", "alert"] as const).map(
          (t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors",
                filterType === t
                  ? "bg-brand-blue text-white"
                  : "bg-[#0A2540]/5 text-[#0A2540]/60 hover:bg-[#0A2540]/10",
              )}
            >
              {t === "all"
                ? "All"
                : t === "status_change"
                  ? "Status"
                  : t === "owner_assignment"
                    ? "Owners"
                    : "Alerts"}
            </button>
          ),
        )}
      </div>

      <ul className="custom-scrollbar -mx-2 flex-1 space-y-2 overflow-y-auto px-2">
        {filteredEvents.length === 0 ? (
          <li className="py-12 text-center text-[10px] font-bold uppercase tracking-widest text-brand-navy/20">
            No activity yet
          </li>
        ) : (
          filteredEvents.map((ev) => (
            <li
              key={ev.id}
              className="rounded-2xl border border-white/60 bg-white/60 p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black text-brand-navy">
                  {ev.berthLabel}
                </span>
                <span className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-brand-navy/30">
                  <Clock size={9} strokeWidth={3} />
                  {ev.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-bold text-brand-navy/60">
                {ev.details}
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

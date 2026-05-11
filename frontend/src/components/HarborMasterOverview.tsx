import { Anchor, LayoutDashboard, X, Zap } from "lucide-react";
import { useEffect, useRef } from "react";
import type { components } from "../api-types";
import { useNow } from "../hooks/useNow";
import { isOnline } from "../lib/freshness";
import { cn } from "../lib/utils";

type Berth = components["schemas"]["BerthOut"];

interface HarborMasterOverviewProps {
  berths: Berth[];
  isOpen?: boolean;
  onCloseCB?: () => void;
}

export function HarborMasterOverview({
  berths,
  isOpen,
  onCloseCB,
}: HarborMasterOverviewProps) {
  const now = useNow();
  const isFirstLoad = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      isFirstLoad.current = false;
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const totalBerths = berths.length;
  const occupiedBerths = berths.filter((b) => b.status === "occupied").length;
  const availableBerths = totalBerths - occupiedBerths;
  const occupancyRate =
    totalBerths > 0 ? Math.round((occupiedBerths / totalBerths) * 100) : 0;

  const activeNodes = berths.filter((b) =>
    isOnline(b.last_updated, now),
  ).length;

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
        "fixed z-[110] flex flex-col overflow-hidden rounded-[32px] border border-white/60 bg-white/70 p-6 font-body shadow-deep backdrop-blur-2xl transition-all duration-500 ease-in-out",
        "bottom-[calc(env(safe-area-inset-bottom)+7rem)] left-6 right-6 max-h-[55dvh]",
        "lg:bottom-auto lg:right-auto lg:left-[var(--sidebar-total-offset,32px)] lg:top-32 lg:w-80 lg:max-h-[calc(100vh-160px)]",
        isFirstLoad.current && "pointer-events-none opacity-0 transition-none",
        isOpen
          ? "pointer-events-auto translate-y-0 opacity-100 lg:translate-x-0"
          : "pointer-events-none translate-y-[150%] opacity-0 lg:-translate-x-[150%] lg:translate-y-0",
      )}
    >
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard
            size={16}
            className="text-brand-blue"
            strokeWidth={2.5}
          />
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#0A2540]/40">
            Harbor Master HUD
          </h2>
        </div>

        <button
          type="button"
          aria-label="Close harbor master overview"
          onPointerDown={handleClosePointerDown}
          onPointerUp={handleClosePointerUp}
          onClick={handleCloseClick}
          className="pointer-events-auto relative z-[130] grid h-10 w-10 touch-manipulation cursor-pointer place-items-center rounded-full bg-[#0A2540]/5 text-[#0A2540]/60 transition-colors active:scale-95 active:bg-[#0A2540]/15"
        >
          <X size={16} strokeWidth={3} />
        </button>
      </header>

      <div className="custom-scrollbar no-scrollbar flex-1 space-y-6 overflow-y-auto pr-2">
        <div className="space-y-1">
          <div className="mb-2 flex items-end justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-navy/30">
              Live Occupancy
            </span>

            <span className="text-2xl font-black tracking-tighter text-brand-navy">
              {occupancyRate}%
            </span>
          </div>

          <div className="h-3 overflow-hidden rounded-full border border-black/5 bg-[#0A2540]/5 p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan shadow-[0_0_12px_rgba(0,147,233,0.3)] transition-all duration-1000 ease-out"
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-3xl border border-white/50 bg-white/80 p-4 shadow-subtle">
            <div className="mb-2 flex items-center gap-2 text-emerald-500">
              <Anchor size={14} strokeWidth={2.5} />
              <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                Free
              </span>
            </div>

            <p className="text-xl font-black text-brand-navy">
              {availableBerths}
              <span className="mx-1 text-sm opacity-30">/</span>
              {totalBerths}
            </p>
          </div>

          <div className="rounded-3xl border border-white/50 bg-white/80 p-4 shadow-subtle">
            <div className="mb-2 flex items-center gap-2 text-brand-blue">
              <Zap size={14} strokeWidth={2.5} />
              <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                Active
              </span>
            </div>

            <p className="text-xl font-black text-brand-navy">{activeNodes}</p>
          </div>
        </div>

        <div className="border-t border-[#0A2540]/5 pt-6">
          <h3 className="mb-4 text-[9px] font-black uppercase tracking-widest text-brand-navy/30">
            System Status
          </h3>

          <div className="space-y-3">
            {[
              {
                label: "IoT Mesh Network",
                status: "Operational",
                color: "bg-emerald-500",
              },
              {
                label: "Real-time Stream",
                status: "Live",
                color: "bg-emerald-500",
              },
              {
                label: "Cloud Sync",
                status: "Active",
                color: "bg-brand-blue",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="group flex items-center justify-between"
              >
                <span className="text-[10px] font-bold text-brand-navy/60 transition-colors group-hover:text-brand-navy">
                  {s.label}
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-tighter text-brand-navy/30">
                    {s.status}
                  </span>
                  <div className={cn("h-1.5 w-1.5 rounded-full", s.color)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

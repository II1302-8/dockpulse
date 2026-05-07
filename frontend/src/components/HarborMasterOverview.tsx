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

  return (
    <section
      className={cn(
        "fixed bg-white/70 backdrop-blur-2xl border border-white/60 shadow-deep",
        "bottom-[calc(env(safe-area-inset-bottom)+7rem)] left-6 right-6 max-h-[55dvh]",
        "lg:bottom-auto lg:right-auto lg:top-32 lg:w-80 lg:max-h-[calc(100vh-160px)] lg:left-[var(--sidebar-total-offset,32px)]",
        "flex flex-col z-[var(--z-panel)] p-6 font-body rounded-[32px] overflow-hidden transition-all duration-500 ease-in-out",
        isFirstLoad.current && "opacity-0 pointer-events-none transition-none",
        isOpen
          ? "translate-y-0 opacity-100 pointer-events-auto lg:translate-x-0"
          : "translate-y-[150%] opacity-0 pointer-events-none lg:-translate-x-[150%] lg:translate-y-0",
      )}
    >
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard
            size={16}
            className="text-brand-blue"
            strokeWidth={2.5}
          />
          <h2 className="text-xs font-black text-[#0A2540]/40 uppercase tracking-[0.2em]">
            Harbor Master HUD
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close harbor overview"
          onClick={onCloseCB}
          className="grid place-items-center w-10 h-10 rounded-full bg-[#0A2540]/5 text-[#0A2540]/60 active:bg-[#0A2540]/15 transition-colors cursor-pointer"
        >
          <X size={16} strokeWidth={3} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar no-scrollbar">
        <div className="space-y-1">
          <div className="flex justify-between items-end mb-2">
            <span className="text-[10px] font-black text-brand-navy/30 uppercase tracking-widest">
              Live Occupancy
            </span>
            <span className="text-2xl font-black text-brand-navy tracking-tighter">
              {occupancyRate}%
            </span>
          </div>
          <div className="h-3 bg-[#0A2540]/5 rounded-full overflow-hidden p-0.5 border border-black/5">
            <div
              className="h-full bg-gradient-to-r from-brand-blue to-brand-cyan rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(0,147,233,0.3)]"
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/80 border border-white/50 p-4 rounded-3xl shadow-subtle">
            <div className="flex items-center gap-2 text-emerald-500 mb-2">
              <Anchor size={14} strokeWidth={2.5} />
              <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                Free
              </span>
            </div>
            <p className="text-xl font-black text-brand-navy">
              {availableBerths}
              <span className="text-sm opacity-30 mx-1">/</span>
              {totalBerths}
            </p>
          </div>
          <div className="bg-white/80 border border-white/50 p-4 rounded-3xl shadow-subtle">
            <div className="flex items-center gap-2 text-brand-blue mb-2">
              <Zap size={14} strokeWidth={2.5} />
              <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                Active
              </span>
            </div>
            <p className="text-xl font-black text-brand-navy">{activeNodes}</p>
          </div>
        </div>

        <div className="pt-6 border-t border-[#0A2540]/5">
          <h3 className="text-[9px] font-black text-brand-navy/30 uppercase tracking-widest mb-4">
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
              { label: "Cloud Sync", status: "Active", color: "bg-brand-blue" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between group"
              >
                <span className="text-[10px] font-bold text-brand-navy/60 group-hover:text-brand-navy transition-colors">
                  {s.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-tighter text-brand-navy/30">
                    {s.status}
                  </span>
                  <div className={cn("w-1.5 h-1.5 rounded-full", s.color)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

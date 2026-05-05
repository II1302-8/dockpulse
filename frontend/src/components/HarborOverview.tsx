import { Activity, BatteryLow, X } from "lucide-react";
import type { components } from "../api-types";
import { useNow } from "../hooks/useNow";
import { isOnline } from "../lib/freshness";
import { cn } from "../lib/utils";

type Berth = components["schemas"]["BerthOut"];

interface HarborOverviewProps {
  berths: Berth[];
  isOpen?: boolean;
  onCloseCB?: () => void;
}

export function HarborOverview({
  berths,
  isOpen = false,
  onCloseCB,
}: HarborOverviewProps) {
  const now = useNow();

  const onlineBerths = berths.filter((berth) =>
    isOnline(berth.last_updated, now),
  );
  const freeBerths = onlineBerths.filter(
    (berth) => berth.status === "free",
  ).length;
  const offlineCount = berths.length - onlineBerths.length;
  const availabilityRate =
    onlineBerths.length > 0 ? (freeBerths / onlineBerths.length) * 100 : 0;

  const lowBatteryNodes = onlineBerths.filter(
    (berth) => berth.battery_pct != null && berth.battery_pct < 20,
  );
  const allClear = lowBatteryNodes.length === 0 && offlineCount === 0;

  function handleClose(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onCloseCB?.();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  return (
    <section
      className={cn(
        "fixed z-[110] flex flex-col overflow-hidden rounded-[32px] border border-white/60 bg-white/70 p-6 font-body shadow-deep backdrop-blur-2xl transition-all duration-500 ease-in-out",
        "bottom-6 left-6 right-6 max-h-[60vh]",
        "lg:bottom-auto lg:right-auto lg:left-8 lg:top-32 lg:w-72 lg:max-h-[calc(100vh-160px)]",
        "lg:pointer-events-auto lg:translate-x-0 lg:opacity-100",
        isOpen
          ? "pointer-events-auto translate-y-0 opacity-100 lg:translate-x-0"
          : "pointer-events-none translate-y-[150%] opacity-0 lg:-translate-x-[150%] lg:translate-y-0",
      )}
    >
      <header className="mb-4 flex items-center justify-between animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#0A2540]/40">
          Harbor Overview
        </h2>

        <button
          type="button"
          onPointerDown={handlePointerDown}
          onClick={handleClose}
          className="pointer-events-auto relative z-[130] rounded-full bg-[#0A2540]/5 p-2 text-[#0A2540]/60 transition-colors hover:bg-[#0A2540]/10 lg:hidden"
          aria-label="Close harbor overview"
        >
          <X size={14} strokeWidth={3} />
        </button>
      </header>

      <div className="custom-scrollbar space-y-4 overflow-y-auto pr-2">
        <article className="rounded-[24px] border border-white/50 bg-white/80 p-5 shadow-subtle backdrop-blur-md transition-all duration-300 hover:shadow-md animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#0093E9]">
              <Activity size={12} strokeWidth={3} />
              Live Status
            </div>

            <span className="rounded-full border border-[#0093E9]/20 bg-[#0093E9]/10 px-2 py-0.5 text-[10px] font-black text-[#0093E9]">
              {availabilityRate.toFixed(0)}%
            </span>
          </div>

          <div className="mb-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tighter text-[#0A2540]">
              {freeBerths}
              <span className="mx-1 text-lg text-[#0A2540]/20">/</span>
              {onlineBerths.length}
            </span>

            <span className="text-[9px] font-bold uppercase tracking-widest text-[#0A2540]/40">
              Berths available
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full border border-black/5 bg-slate-100 shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0093E9] to-[#00E5FF] shadow-[0_0_12px_rgba(0,147,233,0.5)] transition-all duration-1000"
              style={{
                width: `${availabilityRate}%`,
                minWidth: availabilityRate > 0 ? "4px" : "0",
              }}
            />
          </div>

          {offlineCount > 0 && (
            <div className="mt-3 text-[10px] font-bold text-[#0A2540]/50">
              {offlineCount} sensor{offlineCount === 1 ? "" : "s"} offline
            </div>
          )}
        </article>

        <article className="rounded-[24px] border border-white/30 bg-white/40 p-4 shadow-subtle backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-[#0A2540]/50">
            <BatteryLow size={12} strokeWidth={3} />
            Node Alerts
          </div>

          {allClear ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-2">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-600/80">
                All Systems Online
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {offlineCount > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-[#0A2540]/10 bg-[#0A2540]/5 p-2">
                  <span className="text-[10px] font-bold text-[#0A2540]">
                    Offline sensors
                  </span>
                  <span className="text-[10px] font-black text-[#0A2540]/70">
                    {offlineCount}
                  </span>
                </div>
              )}

              {lowBatteryNodes.map((node) => (
                <div
                  key={node.berth_id}
                  className="flex items-center justify-between rounded-xl border border-red-500/10 bg-red-500/5 p-2"
                >
                  <span className="text-[10px] font-bold text-[#0A2540]">
                    B-{node.label || node.berth_id}
                  </span>
                  <span className="text-[10px] font-black text-red-500">
                    {node.battery_pct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

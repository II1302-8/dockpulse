import { Activity, BatteryLow, X } from "lucide-react";
import type { components } from "../api-types";
import { useNow } from "../hooks/useNow";
import { isOnline } from "../lib/freshness";

type Berth = components["schemas"]["Berth"];

interface HarborOverviewProps {
  berths: Berth[];
  isOpen?: boolean;
  onCloseCB?: () => void;
}

export function HarborOverview({
  berths,
  isOpen,
  onCloseCB,
}: HarborOverviewProps) {
  const now = useNow();
  const onlineBerths = berths.filter((b) => isOnline(b.last_updated, now));
  const freeBerths = onlineBerths.filter((b) => b.status === "free").length;
  const availabilityRate =
    onlineBerths.length > 0 ? (freeBerths / onlineBerths.length) * 100 : 0;
  const offlineCount = berths.length - onlineBerths.length;

  // Battery alerts only meaningful for berths we're hearing from.
  const lowBatteryNodes = onlineBerths.filter(
    (b) => b.battery_pct != null && b.battery_pct < 20,
  );
  const allClear = lowBatteryNodes.length === 0 && offlineCount === 0;

  return (
    <section
      className={`fixed top-32 left-8 w-72 max-h-[calc(100vh-160px)] bg-white/70 backdrop-blur-2xl border border-white/60 shadow-deep flex flex-col z-[55] p-6 font-body rounded-[32px] overflow-hidden transition-all duration-500 ease-in-out lg:translate-x-0 lg:opacity-100 lg:flex ${
        isOpen
          ? "translate-x-0 opacity-100 pointer-events-auto"
          : "-translate-x-[120%] opacity-0 pointer-events-none lg:pointer-events-auto"
      }`}
    >
      <header className="mb-4 flex items-center justify-between animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
        <h2 className="text-xs font-black text-[#0A2540]/40 uppercase tracking-[0.2em]">
          Harbor Overview
        </h2>
        <button
          type="button"
          className="lg:hidden p-2 rounded-full bg-[#0A2540]/5 text-[#0A2540]/60"
          onClick={onCloseCB}
        >
          <X size={14} strokeWidth={3} />
        </button>
      </header>

      <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
        {/* Combined Status Card */}
        <article className="bg-white/80 backdrop-blur-md border border-white/50 p-5 rounded-[24px] shadow-subtle hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#0093E9]">
              <Activity size={12} strokeWidth={3} />
              Live Status
            </div>
            <span className="text-[10px] font-black text-[#0093E9] bg-[#0093E9]/10 px-2 py-0.5 rounded-full border border-[#0093E9]/20">
              {availabilityRate.toFixed(0)}%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-black text-[#0A2540] tracking-tighter">
              {freeBerths}
              <span className="text-lg text-[#0A2540]/20 mx-1">/</span>
              {onlineBerths.length}
            </span>
            <span className="text-[9px] font-bold text-[#0A2540]/40 uppercase tracking-widest">
              Berths available
            </span>
          </div>

          <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-black/5 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-[#0093E9] to-[#00E5FF] rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(0,147,233,0.5)]"
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

        {/* Node Health (More compact) */}
        <article className="bg-white/40 backdrop-blur-md border border-white/30 p-4 rounded-[24px] shadow-subtle animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-[#0A2540]/50 mb-3">
            <BatteryLow size={12} strokeWidth={3} />
            Node Alerts
          </div>
          {allClear ? (
            <div className="flex items-center gap-2 p-2 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-600/80">
                All Systems Online
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {offlineCount > 0 && (
                <div className="flex items-center justify-between p-2 bg-[#0A2540]/5 rounded-xl border border-[#0A2540]/10">
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
                  className="flex items-center justify-between p-2 bg-red-500/5 rounded-xl border border-red-500/10"
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

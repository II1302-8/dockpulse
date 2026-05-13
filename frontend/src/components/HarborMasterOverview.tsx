import { Anchor, LayoutDashboard, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { components } from "../api-types";
import { useNow } from "../hooks/useNow";
import { isOnline } from "../lib/freshness";
import { cn } from "../lib/utils";

type Berth = components["schemas"]["BerthOut"];
type HealthStatus = components["schemas"]["HealthStatus"];

const HEALTH_POLL_MS = 30_000;

interface HarborMasterOverviewProps {
  berths: Berth[];
  isOpen?: boolean;
  onCloseCB?: () => void;
  onOpenNodeHealth?: () => void;
}

export function HarborMasterOverview({
  berths,
  isOpen,
  onCloseCB,
  onOpenNodeHealth,
}: HarborMasterOverviewProps) {
  const now = useNow();
  const isFirstLoad = useRef(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      isFirstLoad.current = false;
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // pull /api/health so the system-status block reflects reality instead of
  // hardcoded "Operational". 503 still returns a body, so accept !res.ok
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/health", { credentials: "include" });
        const data = (await res.json()) as HealthStatus;
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) setHealth(null);
      }
    }
    load();
    const id = window.setInterval(load, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isOpen]);

  // only online sensors are eligible to count as available; offline berths
  // shouldn't inflate availability the way they did when subtracted from total
  const onlineBerths = berths.filter((b) => isOnline(b.last_updated, now));
  const totalBerths = berths.length;
  const availableBerths = onlineBerths.filter((b) => b.is_available_now).length;
  const unavailableBerths = totalBerths - availableBerths;
  const occupancyRate =
    totalBerths > 0 ? Math.round((unavailableBerths / totalBerths) * 100) : 0;

  const activeNodes = onlineBerths.length;

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
                Available
              </span>
            </div>

            <p className="text-xl font-black text-brand-navy">
              {availableBerths}
              <span className="mx-1 text-sm opacity-30">/</span>
              {totalBerths}
            </p>
          </div>

          {onOpenNodeHealth ? (
            <button
              type="button"
              onClick={onOpenNodeHealth}
              className="rounded-3xl border border-white/50 bg-white/80 p-4 text-left shadow-subtle transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
            >
              <div className="mb-2 flex items-center justify-between gap-2 text-brand-blue">
                <div className="flex items-center gap-2">
                  <Zap size={14} strokeWidth={2.5} />
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                    Active
                  </span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-40">
                  Open →
                </span>
              </div>

              <p className="text-xl font-black text-brand-navy">
                {activeNodes}
              </p>
            </button>
          ) : (
            <div className="rounded-3xl border border-white/50 bg-white/80 p-4 shadow-subtle">
              <div className="mb-2 flex items-center gap-2 text-brand-blue">
                <Zap size={14} strokeWidth={2.5} />
                <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                  Active
                </span>
              </div>

              <p className="text-xl font-black text-brand-navy">
                {activeNodes}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-[#0A2540]/5 pt-6">
          <h3 className="mb-4 text-[9px] font-black uppercase tracking-widest text-brand-navy/30">
            System Status
          </h3>

          <div className="space-y-3">
            {(() => {
              const okColor = "bg-emerald-500";
              const errColor = "bg-red-500";
              const items: { label: string; status: string; color: string }[] =
                [
                  health
                    ? {
                        label: "MQTT Broker",
                        status: health.mqtt === "ok" ? "Online" : "Offline",
                        color: health.mqtt === "ok" ? okColor : errColor,
                      }
                    : {
                        label: "MQTT Broker",
                        status: "—",
                        color: "bg-slate-300",
                      },
                  health
                    ? {
                        label: "Database",
                        status: health.database === "ok" ? "Online" : "Offline",
                        color: health.database === "ok" ? okColor : errColor,
                      }
                    : { label: "Database", status: "—", color: "bg-slate-300" },
                  health
                    ? {
                        label: "Gateways",
                        status: `${health.gateways_online}/${health.gateways_total}`,
                        color:
                          health.gateways_total > 0 &&
                          health.gateways_online === health.gateways_total
                            ? okColor
                            : "bg-amber-500",
                      }
                    : { label: "Gateways", status: "—", color: "bg-slate-300" },
                ];
              return items.map((s) => (
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
              ));
            })()}
          </div>
        </div>
      </div>
    </section>
  );
}

import { Anchor, LayoutDashboard, X, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { components } from "../api-types";
import { useNow } from "../hooks/useNow";
import { usePolling } from "../hooks/usePolling";
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
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // pull /api/health so the system-status block reflects reality instead of
  // hardcoded "Operational". 503 still returns a body, so accept !res.ok
  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { credentials: "include" });
      const data = (await res.json()) as HealthStatus;
      setHealth(data);
    } catch {
      setHealth(null);
    }
  }, []);
  useEffect(() => {
    if (!isOpen) return;
    loadHealth();
  }, [isOpen, loadHealth]);
  usePolling(loadHealth, HEALTH_POLL_MS, !!isOpen);

  // only online sensors are eligible to count as available; offline berths
  // shouldn't inflate availability the way they did when subtracted from total
  const onlineBerths = berths.filter((b) => isOnline(b.last_updated, now));
  const totalBerths = berths.length;
  const availableBerths = onlineBerths.filter((b) => b.is_available_now).length;
  const unavailableBerths = totalBerths - availableBerths;
  const occupancyRate =
    totalBerths > 0 ? Math.round((unavailableBerths / totalBerths) * 100) : 0;

  const activeNodes = onlineBerths.length;

  return (
    <section
      className={cn(
        "isolate fixed z-[var(--z-panel)] flex flex-col overflow-hidden",
        "border border-white/40 bg-white/40 shadow-deep backdrop-blur-xl rounded-[32px] p-0 font-body",
        "inset-x-0 bottom-0 h-[88dvh] pb-[env(safe-area-inset-bottom)] rounded-t-[32px] rounded-b-none",
        "lg:bottom-auto lg:right-auto lg:left-[var(--sidebar-total-offset,32px)] lg:top-32 lg:w-80 lg:h-auto lg:max-h-[calc(100dvh-160px)] lg:rounded-b-[32px]",
        "transition-all duration-500 ease-in-out",
        isOpen
          ? "pointer-events-auto opacity-100 translate-y-0 lg:translate-x-0"
          : "pointer-events-none opacity-0 translate-y-8 lg:translate-y-0 lg:-translate-x-8",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between border-b border-black/5 p-6",
          isOpen && "animate-in fade-in duration-500 delay-100 fill-mode-both",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-blue/10">
            <LayoutDashboard
              className="text-brand-blue"
              size={20}
              strokeWidth={2.5}
            />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight text-brand-navy">
              Harbor Master HUD
            </h2>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">
              System Overview
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label="Close harbor master overview"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (e.pointerType === "touch") onCloseCB?.();
          }}
          onClick={onCloseCB}
          className="pointer-events-auto relative z-[130] flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-brand-navy/5 text-brand-navy/60 transition-all hover:scale-110 hover:bg-brand-navy/10 active:scale-95"
        >
          <X size={16} strokeWidth={3} />
        </button>
      </div>

      <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-6 pb-28 lg:pb-6">
        <div
          className={cn(
            "space-y-1",
            isOpen &&
              "animate-in fade-in duration-500 delay-200 fill-mode-both",
          )}
        >
          <div className="mb-2 flex items-end justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-brand-navy/30">
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

        <div
          className={cn(
            "grid grid-cols-2 gap-4",
            isOpen &&
              "animate-in fade-in duration-500 delay-300 fill-mode-both",
          )}
        >
          <div className="rounded-3xl border border-white/50 bg-white/80 p-4 shadow-subtle">
            <div className="mb-2 flex items-center gap-2 text-emerald-500">
              <Anchor size={14} strokeWidth={2.5} />
              <span className="text-xs font-black uppercase tracking-widest opacity-60">
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
              <div className="mb-2 flex items-center gap-2 text-brand-blue">
                <Zap size={14} strokeWidth={2.5} />
                <span className="text-xs font-black uppercase tracking-widest opacity-60">
                  Active
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
                <span className="text-xs font-black uppercase tracking-widest opacity-60">
                  Active
                </span>
              </div>

              <p className="text-xl font-black text-brand-navy">
                {activeNodes}
              </p>
            </div>
          )}
        </div>

        <div
          className={cn(
            "border-t border-[#0A2540]/5 pt-6",
            isOpen &&
              "animate-in fade-in duration-500 delay-400 fill-mode-both",
          )}
        >
          <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-brand-navy/30">
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
                  <span className="text-xs font-bold text-brand-navy/60 transition-colors group-hover:text-brand-navy">
                    {s.label}
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-tighter text-brand-navy/30">
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

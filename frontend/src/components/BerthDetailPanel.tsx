import {
  Battery,
  Clock,
  Ruler,
  ShieldCheck,
  Thermometer,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { components } from "../api-types";
import { useBerthDetail } from "../hooks/useBerthDetail";

type Berth = components["schemas"]["BerthOut"];

interface BerthDetailPanelProps {
  berthId: string;
  onCloseCB: () => void;
  berth?: Berth;
}

export function BerthDetailPanel({
  berthId,
  onCloseCB,
  berth: liveBerth,
}: BerthDetailPanelProps) {
  const { berth: fetchedBerth, isLoading, error } = useBerthDetail(berthId);
  const berth = liveBerth || fetchedBerth;
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    // Match this timeout with the duration-500 class in the aside
    setTimeout(() => {
      onCloseCB();
    }, 500);
  };

  return (
    <aside
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden transition-all duration-500",
        "bg-white/40 backdrop-blur-xl border border-white/40 shadow-deep",
        "rounded-[32px] p-0 font-body",
        "bottom-6 left-6 right-6 max-h-[calc(100vh-160px)]",
        "md:max-w-md md:left-auto md:right-8",
        "lg:top-32 lg:bottom-auto lg:w-80 lg:right-8",
        // Enter animations
        "animate-in fade-in slide-in-from-bottom-6 lg:slide-in-from-right-8 duration-700 fill-mode-both",
        // Exit animations
        isClosing && [
          "animate-out fade-out duration-500 fill-mode-both",
          "slide-out-to-bottom-6 lg:slide-out-to-right-8",
        ],
      )}
    >
      <div className="p-6 flex items-center justify-between border-b border-black/5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
        <div>
          <h2 className="text-sm font-black tracking-tight text-brand-navy uppercase">
            Berth Detail
          </h2>
          <p className="text-[9px] font-bold text-brand-navy/40 uppercase tracking-widest">
            Live Telemetry
          </p>
        </div>
        <button
          type="button"
          className="w-11 h-11 flex items-center justify-center rounded-full bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy/60 transition-all hover:scale-110 active:scale-95"
          onClick={handleClose}
          aria-label="Close panel"
        >
          <X size={20} strokeWidth={3} />
        </button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="space-y-6">
            <div className="h-20 w-full bg-slate-100 rounded-2xl animate-pulse" />
            <div className="h-10 w-24 bg-slate-100 rounded-full animate-pulse" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-red-500 text-xs font-bold animate-in zoom-in-95 duration-300">
            Error: {error}
          </div>
        ) : berth ? (
          <div className="space-y-6" key={berth.berth_id}>
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40 mb-1 block">
                Identification
              </span>
              <span className="text-4xl font-black text-brand-blue tracking-tighter">
                {berth.label || berth.berth_id}
              </span>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40 mb-2 block">
                Current Status
              </span>
              <div
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-wider border",
                  berth.status === "occupied"
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    berth.status === "occupied"
                      ? "bg-red-500 animate-pulse drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]"
                      : "bg-emerald-500 glow-emerald",
                  )}
                />
                {berth.status}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400 fill-mode-both">
              {[
                {
                  label: "Length",
                  value: berth.length_m,
                  unit: "m",
                  icon: Ruler,
                },
                {
                  label: "Width",
                  value: berth.width_m,
                  unit: "m",
                  icon: Ruler,
                },
                {
                  label: "Depth",
                  value: berth.depth_m,
                  unit: "m",
                  icon: Thermometer,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-white/80 p-3 rounded-[20px] border border-white/50 shadow-subtle"
                >
                  <span className="text-[8px] font-bold uppercase tracking-widest text-brand-navy/40 mb-1 block">
                    {item.label}
                  </span>
                  <span className="text-xs font-black text-brand-navy tracking-tight">
                    {item.value ? `${item.value}${item.unit}` : "N/A"}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-brand-blue/5 p-5 rounded-[24px] border border-brand-blue/10 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500 fill-mode-both">
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-brand-blue/60 mb-3">
                <Clock size={12} strokeWidth={3} />
                Node Check-in
              </div>
              <span className="text-[10px] font-mono font-bold text-brand-navy bg-white/60 px-3 py-1.5 rounded-xl border border-brand-blue/10 block w-fit shadow-sm">
                {berth.last_updated
                  ? (() => {
                      const d = new Date(berth.last_updated);
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, "0");
                      const day = String(d.getDate()).padStart(2, "0");
                      const h = String(d.getHours()).padStart(2, "0");
                      const min = String(d.getMinutes()).padStart(2, "0");
                      const s = String(d.getSeconds()).padStart(2, "0");
                      return `${y}/${m}/${day} ${h}:${min}:${s}`;
                    })()
                  : "Never"}
              </span>
            </div>

            {berth.battery_pct != null && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-600 fill-mode-both">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/50 flex items-center gap-1">
                    <Battery size={12} strokeWidth={3} />
                    Node Battery
                  </span>
                  <span className="text-[10px] font-black text-brand-navy tracking-tighter">
                    {berth.battery_pct}%
                  </span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden border border-black/5 p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      berth.battery_pct < 20
                        ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                        : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                    }`}
                    style={{ width: `${berth.battery_pct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-brand-navy/20 text-[10px] font-bold uppercase tracking-widest">
            No berth found
          </div>
        )}
      </div>

      <div className="p-6 border-t border-black/5 animate-in fade-in slide-in-from-top-4 duration-500 delay-700 fill-mode-both bg-white/20">
        <button
          type="button"
          className="w-full py-4 bg-gradient-to-r from-brand-blue to-brand-cyan text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-blue/20 hover:shadow-xl hover:shadow-brand-blue/40 hover:-translate-y-0.5 transition-all active:translate-y-0 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3"
          disabled
        >
          <ShieldCheck size={16} strokeWidth={3} />
          Book Berth
        </button>
      </div>
    </aside>
  );
}

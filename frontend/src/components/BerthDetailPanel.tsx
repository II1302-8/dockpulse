import {
  Battery,
  Clock,
  Ruler,
  ShieldCheck,
  Thermometer,
  X,
} from "lucide-react";
import { useBerthDetail } from "../hooks/useBerthDetail";

interface BerthDetailPanelProps {
  berthId: string;
  onCloseCB: () => void;
}

export function BerthDetailPanel({
  berthId,
  onCloseCB,
}: BerthDetailPanelProps) {
  const { berth, isLoading, error } = useBerthDetail(berthId);

  return (
    <aside className="animate-in backdrop-blur-2xl bg-white/70 border border-white/60 bottom-6 duration-700 fade-in fill-mode-both fixed flex flex-col font-body left-6 lg:bottom-auto lg:left-auto lg:right-8 lg:top-32 lg:w-80 max-h-[calc(100vh-160px)] overflow-hidden p-0 right-6 rounded-[32px] shadow-deep slide-in-from-bottom-6 lg:slide-in-from-right-8 z-50 transition-all duration-500 md:max-w-md md:left-auto md:right-8">
      <div className="p-6 flex items-center justify-between border-b border-black/5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
        <div>
          <h2 className="text-sm font-black tracking-tight text-[#0A2540] uppercase">
            Berth Detail
          </h2>
          <p className="text-[9px] font-bold text-[#0A2540]/40 uppercase tracking-widest">
            Live Telemetry
          </p>
        </div>
        <button
          type="button"
          className="w-11 h-11 flex items-center justify-center rounded-full bg-[#0A2540]/5 hover:bg-[#0A2540]/10 text-[#0A2540]/60 transition-all hover:scale-110 active:scale-95"
          onClick={onCloseCB}
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
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#0A2540]/40 mb-1 block">
                Identification
              </span>
              <span className="text-4xl font-black text-[#0093E9] tracking-tighter">
                {berth.label || berth.berth_id}
              </span>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#0A2540]/40 mb-2 block">
                Current Status
              </span>
              <div
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-wider border ${
                  berth.status === "occupied"
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    berth.status === "occupied"
                      ? "bg-red-500 animate-pulse"
                      : "bg-emerald-500"
                  }`}
                />
                {berth.status}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
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
                  <span className="text-[8px] font-bold uppercase tracking-widest text-[#0A2540]/40 mb-1 block">
                    {item.label}
                  </span>
                  <span className="text-xs font-black text-[#0A2540] tracking-tight">
                    {item.value ? `${item.value}${item.unit}` : "N/A"}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-[#0093E9]/5 p-5 rounded-[24px] border border-[#0093E9]/10 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400 fill-mode-both">
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-[#0093E9]/60 mb-3">
                <Clock size={12} strokeWidth={3} />
                Node Check-in
              </div>
              <span className="text-[10px] font-mono font-bold text-[#0A2540] bg-white/60 px-3 py-1.5 rounded-xl border border-[#0093E9]/10 block w-fit shadow-sm">
                {berth.last_updated
                  ? new Date(berth.last_updated).toLocaleString()
                  : "Never"}
              </span>
            </div>

            {berth.battery_pct != null && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500 fill-mode-both">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#0A2540]/50 flex items-center gap-1">
                    <Battery size={12} strokeWidth={3} />
                    Node Battery
                  </span>
                  <span className="text-[10px] font-black text-[#0A2540] tracking-tighter">
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
          <div className="text-center py-12 text-[#0A2540]/20 text-[10px] font-bold uppercase tracking-widest">
            No berth found
          </div>
        )}
      </div>

      <div className="p-6 border-t border-black/5 animate-in fade-in slide-in-from-top-4 duration-500 delay-600 fill-mode-both bg-white/40">
        <button
          type="button"
          className="w-full py-4 bg-gradient-to-r from-[#0093E9] to-[#00E5FF] text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-[#0093E9]/20 hover:shadow-xl hover:shadow-[#0093E9]/40 hover:-translate-y-0.5 transition-all active:translate-y-0 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3"
          disabled
        >
          <ShieldCheck size={16} strokeWidth={3} />
          Book Berth
        </button>
      </div>
    </aside>
  );
}

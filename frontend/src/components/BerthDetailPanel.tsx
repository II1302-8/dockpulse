import {
  Battery,
  Clock,
  Ruler,
  ShieldCheck,
  Thermometer,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type { components } from "../api-types";
import { useBerthDetail } from "../hooks/useBerthDetail";
import { cn } from "../lib/utils";
import type { AuthOutletContext } from "./layout/MainLayout";

type Event = components["schemas"]["EventOut"];
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
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  const { user: currentUser, token } = useOutletContext<AuthOutletContext>();
  const isHarborMaster = currentUser?.role === "harbormaster";

  const { berth: fetchedBerth, isLoading, error } = useBerthDetail(berthId);
  const berth = liveBerth || fetchedBerth;

  const [events, setEvents] = useState<Event[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!isHarborMaster) return;

    const controller = new AbortController();

    async function fetchEvents() {
      setIsEventsLoading(true);

      try {
        const res = await fetch(`/api/berths/${berthId}/events`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to fetch berth events", err);
        }
      } finally {
        if (!controller.signal.aborted) setIsEventsLoading(false);
      }
    }

    fetchEvents();

    return () => controller.abort();
  }, [berthId, isHarborMaster, token]);

  function handleClose(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    setIsClosing(true);

    setTimeout(() => {
      onCloseCB();
    }, 500);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  return (
    <aside
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        "pointer-events-auto fixed z-[110] flex flex-col overflow-hidden transition-all duration-500",
        "border border-white/40 bg-white/40 shadow-deep backdrop-blur-xl",
        "rounded-[32px] p-0 font-body",
        "bottom-6 left-6 right-6 max-h-[calc(100vh-160px)]",
        "md:left-auto md:right-8 md:max-w-md",
        "lg:top-32 lg:right-8 lg:bottom-auto lg:w-80",
        "animate-in fade-in slide-in-from-bottom-6 duration-700 fill-mode-both lg:slide-in-from-right-8",
        isClosing && [
          "animate-out fade-out duration-500 fill-mode-both",
          "slide-out-to-bottom-6 lg:slide-out-to-right-8",
        ],
      )}
    >
      <div className="flex items-center justify-between border-b border-black/5 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
        <div>
          <h2 className="text-sm font-black uppercase tracking-tight text-brand-navy">
            Berth Detail
          </h2>
          <p className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
            Live Telemetry
          </p>
        </div>

        <button
          type="button"
          onPointerDown={handlePointerDown}
          onClick={handleClose}
          className="pointer-events-auto relative z-[130] flex h-14 w-14 items-center justify-center rounded-full bg-brand-navy/5 text-brand-navy/60 transition-all hover:scale-110 hover:bg-brand-navy/10 active:scale-95"
          aria-label="Close berth details"
        >
          <X size={22} strokeWidth={3} />
        </button>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="space-y-6">
            <div className="h-20 w-full animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-10 w-24 animate-pulse rounded-full bg-slate-100" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/10 bg-red-500/5 p-4 text-xs font-bold text-red-500 animate-in zoom-in-95 duration-300">
            Error: {error}
          </div>
        ) : berth ? (
          <div className="space-y-6" key={berth.berth_id}>
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
                Identification
              </span>
              <span className="text-4xl font-black tracking-tighter text-brand-blue">
                {berth.label || berth.berth_id}
              </span>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
              <span className="mb-2 block text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
                Current Status
              </span>
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider",
                  berth.status === "occupied"
                    ? "border-red-500/20 bg-red-500/10 text-red-500"
                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    berth.status === "occupied"
                      ? "animate-pulse bg-red-500 drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]"
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
                  className="rounded-[20px] border border-white/50 bg-white/80 p-3 shadow-subtle"
                >
                  <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-brand-navy/40">
                    {item.label}
                  </span>
                  <span className="text-xs font-black tracking-tight text-brand-navy">
                    {item.value ? `${item.value}${item.unit}` : "N/A"}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-[24px] border border-brand-blue/10 bg-brand-blue/5 p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500 fill-mode-both">
              <div className="mb-3 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-brand-blue/60">
                <Clock size={12} strokeWidth={3} />
                Node Check-in
              </div>
              <span className="block w-fit rounded-xl border border-brand-blue/10 bg-white/60 px-3 py-1.5 font-mono text-[10px] font-bold text-brand-navy shadow-sm">
                {berth.last_updated
                  ? new Date(berth.last_updated).toLocaleString()
                  : "Never"}
              </span>
            </div>

            {isHarborMaster && berth.assignment && marinaSlug && (
              <div className="mt-6 border-t border-black/5 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-550 fill-mode-both">
                <span className="mb-3 block text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
                  Ownership Details
                </span>
                <Link
                  to={`/${marinaSlug}/profile/${berth.assignment.user_id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm transition-all hover:bg-brand-blue/5 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue transition-transform group-hover:scale-110">
                    <span className="text-xs font-black">
                      {berth.assignment.user_id.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-navy transition-colors group-hover:text-brand-blue">
                      Owner Profile
                    </p>
                    <p className="text-[9px] font-bold text-brand-navy/40">
                      ID: {berth.assignment.user_id}
                    </p>
                  </div>
                </Link>
              </div>
            )}

            {berth.battery_pct != null && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-600 fill-mode-both">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-brand-navy/50">
                    <Battery size={12} strokeWidth={3} />
                    Node Battery
                  </span>
                  <span className="text-[10px] font-black tracking-tighter text-brand-navy">
                    {berth.battery_pct}%
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full border border-black/5 bg-slate-100 p-0.5">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-1000 ease-out",
                      berth.battery_pct < 20
                        ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                        : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]",
                    )}
                    style={{ width: `${berth.battery_pct}%` }}
                  />
                </div>
              </div>
            )}

            {isHarborMaster && (
              <div className="mt-6 border-t border-black/5 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-750 fill-mode-both">
                <span className="mb-4 block text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
                  Recent Activity
                </span>

                {isEventsLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-blue/30 border-t-brand-blue" />
                  </div>
                ) : events.length === 0 ? (
                  <p className="py-4 text-center text-[10px] font-bold uppercase tracking-widest text-brand-navy/20">
                    No recent events
                  </p>
                ) : (
                  <div className="space-y-3">
                    {events.slice(0, 5).map((ev) => (
                      <div key={ev.event_id} className="flex items-start gap-3">
                        <div
                          className={cn(
                            "mt-1.5 h-1.5 w-1.5 rounded-full",
                            ev.event_type === "occupied"
                              ? "bg-red-500"
                              : ev.event_type === "freed"
                                ? "bg-emerald-500"
                                : "bg-slate-300",
                          )}
                        />
                        <div className="flex-1">
                          <p className="text-[11px] font-bold capitalize text-brand-navy/70">
                            {ev.event_type}
                          </p>
                          <p className="text-[8px] font-bold uppercase tracking-widest text-brand-navy/30">
                            {new Date(ev.timestamp).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center text-[10px] font-bold uppercase tracking-widest text-brand-navy/20">
            No berth found
          </div>
        )}
      </div>

      <div className="border-t border-black/5 bg-white/20 p-6 animate-in fade-in slide-in-from-top-4 duration-500 delay-700 fill-mode-both">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-brand-blue to-brand-cyan py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-brand-blue/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-blue/40 active:translate-y-0 disabled:opacity-50 disabled:grayscale"
          disabled
        >
          <ShieldCheck size={16} strokeWidth={3} />
          Book Berth
        </button>
      </div>
    </aside>
  );
}

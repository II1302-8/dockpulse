import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Battery,
  Clock,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { components } from "../api-types";
import { usePolling } from "../hooks/usePolling";
import { apiFetch } from "../lib/api";
import { fmtTime } from "../lib/date";
import { cn } from "../lib/utils";
import type { AuthOutletContext } from "./layout/MainLayout";

type NodeHealth = components["schemas"]["NodeHealthOut"];

interface NodeHealthPanelProps {
  isOpen?: boolean;
  onCloseCB: () => void;
}

const POLL_INTERVAL_MS = 30_000;

export function NodeHealthPanel({ isOpen, onCloseCB }: NodeHealthPanelProps) {
  const { user } = useOutletContext<AuthOutletContext>();
  const isHarborMaster = user?.role?.toLowerCase().trim() === "harbormaster";

  const [nodes, setNodes] = useState<NodeHealth[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const fetchNodes = useCallback(async () => {
    if (!isHarborMaster) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/nodes");
      if (!res.ok) {
        setError(`Could not load nodes (status ${res.status}).`);
        return;
      }
      setNodes((await res.json()) as NodeHealth[]);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load nodes.");
    } finally {
      setIsLoading(false);
    }
  }, [isHarborMaster]);

  useEffect(() => {
    if (!isOpen || !isHarborMaster) return;
    fetchNodes();
  }, [isOpen, isHarborMaster, fetchNodes]);
  usePolling(fetchNodes, POLL_INTERVAL_MS, !!isOpen && isHarborMaster);

  const filteredNodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return nodes;
    return nodes.filter(
      (node) =>
        node.serial_number.toLowerCase().includes(query) ||
        node.berth_id?.toLowerCase().includes(query),
    );
  }, [nodes, searchQuery]);

  // primary: offline → stale → online → decommissioned. secondary: battery
  const sortedNodes = useMemo(() => {
    const healthPriority: Record<string, number> = {
      offline: 0,
      stale: 1,
      online: 2,
      decommissioned: 3,
    };
    return [...filteredNodes].sort((a, b) => {
      const priorityA = healthPriority[a.health] ?? 99;
      const priorityB = healthPriority[b.health] ?? 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const batteryA = a.battery_pct ?? 101;
      const batteryB = b.battery_pct ?? 101;
      const comparison = batteryA - batteryB;
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredNodes, sortOrder]);

  if (!isHarborMaster) return null;

  return (
    <aside
      className={cn(
        "isolate fixed border border-white/60 bg-white/70 shadow-deep backdrop-blur-2xl",
        "inset-x-0 bottom-0 max-h-[88dvh] pb-[env(safe-area-inset-bottom)] rounded-t-[32px] rounded-b-none",
        "lg:bottom-auto lg:right-auto lg:left-[var(--sidebar-total-offset,32px)] lg:top-32 lg:w-96 lg:max-h-[calc(100vh-160px)] lg:rounded-b-[32px]",
        "z-[var(--z-panel)] flex flex-col overflow-hidden rounded-[32px] p-6 font-body transition-all duration-500 ease-in-out",
        isOpen
          ? "pointer-events-auto translate-y-0 opacity-100 lg:translate-x-0"
          : "pointer-events-none translate-y-[150%] opacity-0 lg:-translate-x-[150%] lg:translate-y-0",
      )}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="text-brand-blue" size={18} strokeWidth={3} />
            <h2 className="text-sm font-black uppercase tracking-tight text-brand-navy">
              Node Health
            </h2>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">
            Sensor Network Diagnostics
          </p>
        </div>

        <button
          type="button"
          onClick={onCloseCB}
          // ios drops click after backdrop-blur stacking, pointerup fallback
          onPointerUp={(e) => {
            if (e.pointerType !== "touch") return;
            e.preventDefault();
            onCloseCB?.();
          }}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-navy/5 text-brand-navy/60 transition-all hover:scale-110 hover:bg-brand-navy/10 active:scale-95"
          aria-label="Close panel"
        >
          <X size={20} strokeWidth={3} />
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-navy/30"
            size={14}
          />
          <input
            type="text"
            placeholder="Search Serial Number or Berth..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/50 bg-white/50 py-2.5 pl-10 pr-4 text-[11px] font-bold text-brand-navy placeholder:text-brand-navy/20 focus:border-brand-blue/30 focus:outline-none focus:ring-2 focus:ring-brand-blue/10"
          />
        </div>
        <button
          type="button"
          title={`Sort ${sortOrder === "asc" ? "Descending" : "Ascending"}`}
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/50 bg-white/50 text-brand-navy/40 transition-all hover:bg-white/80 hover:text-brand-blue active:scale-95"
        >
          {sortOrder === "asc" ? (
            <ArrowUp size={16} strokeWidth={2.5} />
          ) : (
            <ArrowDown size={16} strokeWidth={2.5} />
          )}
        </button>
      </div>

      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
        {error ? (
          <div className="rounded-2xl border border-red-500/10 bg-red-500/5 p-4 text-xs font-bold text-red-500">
            {error}
          </div>
        ) : isLoading && nodes.length === 0 ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 w-full animate-pulse rounded-2xl bg-white/40"
              />
            ))}
          </div>
        ) : sortedNodes.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/20">
              No nodes found
            </p>
          </div>
        ) : (
          sortedNodes.map((node) => {
            const isCritical = node.health === "offline";
            const isWarning = node.health === "stale";
            const isBatteryLow = (node.battery_pct ?? 100) < 15;

            return (
              <div
                key={node.node_id}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border transition-all duration-300",
                  isCritical
                    ? "border-red-500/20 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.05)]"
                    : isWarning
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-white/60 bg-white/60 shadow-sm hover:bg-white/80",
                )}
              >
                <div className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-brand-navy">
                        {node.serial_number}
                      </span>
                      <span className="rounded-lg bg-brand-blue/10 px-2 py-0.5 text-xs font-bold text-brand-blue">
                        {node.berth_id || "Unassigned"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          node.health === "online"
                            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                            : node.health === "stale"
                              ? "bg-amber-500"
                              : "animate-pulse bg-red-500",
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          node.health === "online"
                            ? "text-emerald-600"
                            : node.health === "stale"
                              ? "text-amber-600"
                              : "text-red-600",
                        )}
                      >
                        {node.health}
                      </span>

                      {(isCritical || isWarning) && (
                        <div className="ml-1 flex items-center gap-1">
                          <AlertTriangle
                            size={10}
                            className={
                              isCritical ? "text-red-500" : "text-amber-500"
                            }
                          />
                          <span
                            className={cn(
                              "text-[8px] font-black uppercase",
                              isCritical ? "text-red-500" : "text-amber-500",
                            )}
                          >
                            Inspection Req
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    {node.battery_pct != null ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Battery
                            size={12}
                            className={cn(
                              isBatteryLow
                                ? "text-red-500"
                                : "text-brand-navy/40",
                            )}
                          />
                          <span
                            className={cn(
                              "text-xs font-black tracking-tighter",
                              isBatteryLow ? "text-red-600" : "text-brand-navy",
                            )}
                          >
                            {node.battery_pct}%
                          </span>
                        </div>
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-black/5">
                          <div
                            className={cn(
                              "h-full transition-all duration-1000",
                              isBatteryLow ? "bg-red-500" : "bg-emerald-500",
                            )}
                            style={{ width: `${node.battery_pct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-brand-navy/20">
                        <Clock size={12} strokeWidth={2.5} />
                        <span className="text-xs font-bold">N/A</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 border-t border-black/5 pt-4">
        <p className="text-center text-[8px] font-bold uppercase tracking-[0.2em] text-brand-navy/20">
          Last updated: {lastUpdated ? fmtTime(lastUpdated) : "never"}
        </p>
      </div>
    </aside>
  );
}

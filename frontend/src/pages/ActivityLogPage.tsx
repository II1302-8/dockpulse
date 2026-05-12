import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  RefreshCw,
  User,
  UserX,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type { AuthOutletContext } from "../components/layout/MainLayout";
import { type HarborEvent, useHarborEvents } from "../hooks/useHarborEvents";
import { getMarinaNameCB } from "../lib/marinas";
import { cn } from "../lib/utils";

const PAGE_SIZE = 50;

type FilterKey = "all" | "status" | "owners" | "alerts";

const FILTER_TO_TYPES: Record<FilterKey, string[] | null> = {
  all: null,
  status: ["occupied", "freed"],
  owners: ["assignment_removed"],
  alerts: ["alert_unauthorized"],
};

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "occupied":
      return "Arrived";
    case "freed":
      return "Departed";
    case "alert_unauthorized":
      return "Unauthorized access";
    case "heartbeat":
      return "Heartbeat";
    case "assignment_removed":
      return "Tenant removed";
    default:
      return eventType;
  }
}

function csvEscape(value: string): string {
  // RFC 4180: wrap in quotes, double any embedded quote
  return `"${value.replace(/"/g, '""')}"`;
}

export function ActivityLogPage() {
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  const marinaName = getMarinaNameCB(marinaSlug);
  const { user } = useOutletContext<AuthOutletContext>();
  const harborId =
    (user as { harbor_id?: string | null } | null)?.harbor_id ??
    marinaSlug ??
    null;

  const [filter, setFilter] = useState<FilterKey>("all");
  const [page, setPage] = useState(1);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const eventTypes = FILTER_TO_TYPES[filter];
  const { items, total, isLoading, error, refresh } = useHarborEvents(
    harborId,
    { page, pageSize: PAGE_SIZE, eventTypes },
  );

  useEffect(() => {
    document.title = `${marinaName} - Activity Log | DockPulse`;
  }, [marinaName]);

  // reset page when the filter changes
  useEffect(() => {
    setPage(1);
  }, []);

  // highlight the newest event when a fresh page lands on page 1
  useEffect(() => {
    if (page === 1 && items.length > 0) {
      setHighlightId(items[0].event_id);
      const t = setTimeout(() => setHighlightId(null), 2000);
      return () => clearTimeout(t);
    }
  }, [items, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageNumbers = useMemo(() => {
    // condensed pager: first, last, current ±2, with ellipses for gaps
    const pages = new Set<number>([1, totalPages, page]);
    for (
      let i = Math.max(2, page - 2);
      i <= Math.min(totalPages - 1, page + 2);
      i++
    ) {
      pages.add(i);
    }
    const sorted = [...pages].sort((a, b) => a - b);
    const out: (number | "...")[] = [];
    for (let i = 0; i < sorted.length; i++) {
      out.push(sorted[i]);
      if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1)
        out.push("...");
    }
    return out;
  }, [page, totalPages]);

  function handleFilter(next: FilterKey) {
    setFilter(next);
    setPage(1);
  }

  function handleExportCSV() {
    if (items.length === 0) return;
    const headers = ["Timestamp", "Berth", "Type", "Actor", "Subject"];
    const rows = items.map((e) => [
      e.timestamp,
      e.berth_id,
      eventLabel(e.event_type),
      e.actor_user_id ?? "",
      e.subject_user_id ?? "",
    ]);
    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((r) => r.map((c) => csvEscape(String(c))).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dockpulse_activity_${marinaSlug ?? "harbor"}_p${page}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (user?.role !== "harbormaster") {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-24 pb-20 lg:pt-36">
        <h1 className="text-3xl font-semibold text-brand-navy">Activity Log</h1>
        <p className="mt-2 text-brand-navy/60">Harbormaster role required.</p>
      </main>
    );
  }

  const filterButtons: { id: FilterKey; label: string; icon: JSX.Element }[] = [
    { id: "all", label: "All", icon: <Filter size={14} /> },
    { id: "status", label: "Status", icon: <Activity size={14} /> },
    { id: "owners", label: "Owners", icon: <UserX size={14} /> },
    { id: "alerts", label: "Alerts", icon: <AlertTriangle size={14} /> },
  ];

  return (
    <div className="flex h-full min-h-dvh flex-col overflow-hidden bg-[#F8FAFC]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link
            to={`/${marinaSlug}`}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
            title="Back to dashboard"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-blue/10">
              <Activity className="text-brand-blue" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                Harbor Activity
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                {marinaName} Log
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition-all hover:bg-slate-100 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw size={16} className={cn(isLoading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={items.length === 0}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-slate-100 disabled:opacity-30"
          >
            <Download size={16} />
            Export page
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white/50 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/50 bg-slate-100 p-1">
          {filterButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => handleFilter(btn.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-black uppercase tracking-widest transition-all",
                filter === btn.id
                  ? "bg-white text-brand-blue shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {btn.icon}
              {btn.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[11px] font-bold text-slate-400">
          {total === 0
            ? "0 events"
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                page * PAGE_SIZE,
                total,
              )} of ${total}`}
        </span>
      </div>

      <div className="custom-scrollbar flex-1 overflow-auto p-6">
        {isLoading && items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-400">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-blue/20 border-t-brand-blue" />
            <p className="text-xs font-black uppercase tracking-widest">
              Fetching harbor logs...
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/10 bg-red-500/5 p-6 text-sm font-bold text-red-500">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-20 text-center">
            <div className="mb-6 grid h-20 w-20 place-items-center rounded-full bg-slate-100">
              <Clock size={40} className="text-slate-300" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-900">
              No activity yet
            </h3>
            <p className="max-w-xs text-sm text-slate-500">
              Activity will appear here as sensor events and assignments occur.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-xl shadow-slate-200/40">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Timestamp
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Berth
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Event
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Actor / subject
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((event: HarborEvent) => {
                  const isAlert = event.event_type === "alert_unauthorized";
                  const isAudit = event.event_type === "assignment_removed";
                  const isHighlight = event.event_id === highlightId;
                  return (
                    <tr
                      key={event.event_id}
                      className={cn(
                        "group transition-colors",
                        isHighlight
                          ? "bg-brand-blue/10"
                          : "hover:bg-slate-50/80",
                      )}
                    >
                      <td className="whitespace-nowrap px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">
                            {new Date(event.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {new Date(event.timestamp).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-5">
                        <span className="rounded-lg border border-slate-200/50 bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">
                          {event.berth_id}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                            isAlert
                              ? "bg-amber-50 text-amber-700"
                              : isAudit
                                ? "bg-rose-50 text-rose-700"
                                : "bg-brand-blue/10 text-brand-blue",
                          )}
                        >
                          {isAlert && <AlertTriangle size={10} />}
                          {isAudit && <UserX size={10} />}
                          {eventLabel(event.event_type)}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-xs text-slate-500">
                        {event.actor_user_id || event.subject_user_id ? (
                          <div className="space-y-0.5">
                            {event.actor_user_id && (
                              <div className="flex items-center gap-1">
                                <User size={10} />
                                <span className="font-mono">
                                  {event.actor_user_id}
                                </span>
                              </div>
                            )}
                            {event.subject_user_id && (
                              <div className="flex items-center gap-1 text-slate-400">
                                <span className="text-[9px] uppercase">
                                  → subject
                                </span>
                                <span className="font-mono">
                                  {event.subject_user_id}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {total} total events
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <div className="flex items-center gap-1">
            {pageNumbers.map((p, i) =>
              p === "..." ? (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: static gap markers
                  key={`gap-${i}`}
                  className="px-1 text-xs text-slate-300"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={cn(
                    "h-8 w-8 rounded-lg text-xs font-bold transition-all",
                    page === p
                      ? "bg-brand-blue text-white shadow-md shadow-brand-blue/20"
                      : "text-slate-400 hover:bg-slate-100",
                  )}
                >
                  {p}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || isLoading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-slate-100 disabled:opacity-30"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </div>
  );
}

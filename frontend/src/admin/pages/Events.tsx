import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminGet } from "../api";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Table } from "../components/Table";
import { fmtRelative } from "../format";

interface Event {
  event_id: string;
  berth_id: string;
  harbor_id: string;
  node_id: string | null;
  event_type: string;
  timestamp: string;
  actor_user_id: string | null;
  subject_user_id: string | null;
}

interface EventList {
  items: Event[];
  total: number;
}

interface Harbor {
  harbor_id: string;
  name: string;
}

const PAGE_SIZE = 50;
const TYPES = [
  "occupied",
  "freed",
  "alert_unauthorized",
  "heartbeat",
  "assignment_removed",
];

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return `${err.status} — ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export function EventsPage() {
  const [items, setItems] = useState<Event[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [harborId, setHarborId] = useState("");
  const [eventType, setEventType] = useState("");
  const [harbors, setHarbors] = useState<Harbor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    if (harborId) params.set("harbor_id", harborId);
    if (eventType) params.set("event_type", eventType);
    try {
      const data = await adminGet<EventList>(`/events?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [page, harborId, eventType]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    adminGet<Harbor[]>("/harbors")
      .then(setHarbors)
      .catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Events"
        hint="Cross-harbor audit stream. Filter by harbor or event type. Newest first; paged 50 at a time."
        actions={
          <Button onClick={refresh} variant="secondary" disabled={isLoading}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={harborId}
          onChange={(e) => {
            setPage(1);
            setHarborId(e.target.value);
          }}
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"
        >
          <option value="">All harbors</option>
          {harbors.map((h) => (
            <option key={h.harbor_id} value={h.harbor_id}>
              {h.name} ({h.harbor_id})
            </option>
          ))}
        </select>
        <select
          value={eventType}
          onChange={(e) => {
            setPage(1);
            setEventType(e.target.value);
          }}
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"
        >
          <option value="">All event types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="ml-auto self-center text-[11px] font-bold text-brand-navy/40">
          {total === 0
            ? "0 events"
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                page * PAGE_SIZE,
                total,
              )} of ${total}`}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-sm text-brand-navy/50">Loading…</div>
      ) : (
        <>
          <Table
            head={["When", "Harbor", "Berth", "Type", "Actor / subject"]}
            rows={items.map((e) => ({
              key: e.event_id,
              tone:
                e.event_type === "alert_unauthorized"
                  ? "warn"
                  : e.event_type === "assignment_removed"
                    ? "danger"
                    : "default",
              cells: [
                fmtRelative(e.timestamp),
                e.harbor_id,
                e.berth_id,
                e.event_type,
                e.actor_user_id || e.subject_user_id
                  ? `${e.actor_user_id ?? ""}${e.subject_user_id ? ` → ${e.subject_user_id}` : ""}`
                  : "—",
              ],
            }))}
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              Previous
            </Button>
            <span className="text-xs font-bold text-brand-navy/50">
              page {page} of {totalPages}
            </span>
            <Button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isLoading}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

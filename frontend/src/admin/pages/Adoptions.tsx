import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminDelete, adminGet, adminPost } from "../api";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Table } from "../components/Table";
import { fmtRelative } from "../format";

interface Adoption {
  request_id: string;
  mesh_uuid: string;
  serial_number: string;
  gateway_id: string;
  berth_id: string;
  status: "pending" | "ok" | "err";
  error_code: string | null;
  error_msg: string | null;
  expires_at: string;
  created_at: string;
  completed_at: string | null;
}

type Filter = "all" | "pending" | "err" | "ok";

export function AdoptionsPage() {
  const [items, setItems] = useState<Adoption[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const refresh = useCallback(async () => {
    const qs = filter === "all" ? "" : `?status=${filter}`;
    try {
      const data = await adminGet<Adoption[]>(`/adoptions${qs}`);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? `${err.status} — ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to load",
      );
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function cancel(requestId: string) {
    if (!window.confirm(`Cancel pending adoption ${requestId}?`)) return;
    setBusyId(requestId);
    try {
      await adminPost(`/adoptions/${encodeURIComponent(requestId)}/cancel`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkDelete(status: "err" | "pending" | "ok" | "all") {
    const label =
      status === "all" ? "ALL adoption requests" : `all ${status} rows`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      const res = await adminDelete<{ deleted: number }>("/adoptions", {
        params: { status },
      });
      await refresh();
      window.alert(`Deleted ${res?.deleted ?? "?"} row(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function runSweeper() {
    setBulkBusy(true);
    try {
      const res = await adminPost<{ expired: number; pruned: number }>(
        "/sweeper/run",
      );
      await refresh();
      window.alert(
        `Sweeper: ${res?.expired ?? 0} pending → err, ${res?.pruned ?? 0} old err pruned`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sweeper failed");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Adoptions"
        hint="Pending and recent adoption requests. Cancel a stuck pending row, run sweeper to time out expired ones, or bulk-delete by status to free up claim_jti for re-scan."
        actions={
          <>
            <Button
              onClick={runSweeper}
              disabled={bulkBusy}
              tooltip="Force the sweeper to time out expired pending rows and prune old err rows"
            >
              Run sweeper
            </Button>
            <Button
              variant="danger"
              onClick={() => bulkDelete("err")}
              disabled={bulkBusy}
              tooltip="Delete every err row to free up claim_jti for re-scan"
            >
              Delete all err
            </Button>
            <Button
              onClick={refresh}
              variant="secondary"
              tooltip="Refetch the current filter from /api/admin/adoptions"
            >
              Refresh
            </Button>
          </>
        }
      />

      <div className="flex gap-2 mb-4">
        {(["all", "pending", "err", "ok"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "primary" : "secondary"}
            onClick={() => setFilter(f)}
            tooltip={`Show ${f === "all" ? "every adoption" : `${f} rows`} only`}
          >
            {f}
          </Button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-2xl bg-red-500/5 border border-red-500/20 text-red-700 text-sm">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-brand-navy/50 text-sm">Loading…</div>
      ) : (
        <Table
          head={[
            "Request",
            "Berth",
            "Gateway",
            "Status",
            "Detail",
            "Created",
            "",
          ]}
          rows={items.map((a) => ({
            key: a.request_id,
            tone:
              a.status === "ok" ? "ok" : a.status === "err" ? "danger" : "warn",
            cells: [
              a.request_id.slice(0, 8),
              a.berth_id,
              a.gateway_id,
              a.status,
              a.status === "err"
                ? `${a.error_code ?? "unknown"}${a.error_msg ? ` — ${a.error_msg}` : ""}`
                : a.status === "pending"
                  ? `expires ${fmtRelative(a.expires_at)}`
                  : "—",
              fmtRelative(a.created_at),
              a.status === "pending" ? (
                <Button
                  key="cancel"
                  variant="danger"
                  disabled={busyId === a.request_id}
                  onClick={() => cancel(a.request_id)}
                  tooltip="Mark as err:cancelled (frees claim_jti after sweeper prune)"
                >
                  {busyId === a.request_id ? "Cancelling" : "Cancel"}
                </Button>
              ) : (
                <span key="dash" className="text-brand-navy/30">
                  —
                </span>
              ),
            ],
          }))}
        />
      )}
    </div>
  );
}

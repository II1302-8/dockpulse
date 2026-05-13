import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminApiError, adminDelete, adminGet, adminPost } from "../api";
import { Button } from "../components/Button";
import { FilterInput } from "../components/FilterInput";
import { PageHeader } from "../components/PageHeader";
import { Table } from "../components/Table";
import { fmtRelative } from "../format";

interface Alert {
  alert_id: string;
  berth_id: string;
  type: string;
  message: string;
  acknowledged: boolean;
  timestamp: string;
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return `${err.status} — ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [filter, setFilter] = useState("");
  const [showAcked, setShowAcked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const qs = showAcked ? "" : "?acknowledged=false";
      setAlerts(await adminGet<Alert[]>(`/alerts${qs}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [showAcked]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function ack(alertId: string) {
    setBusyId(alertId);
    try {
      await adminPost(`/alerts/${encodeURIComponent(alertId)}/acknowledge`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(alertId: string) {
    if (!window.confirm(`Hard-delete alert ${alertId}? Audit trail is lost.`))
      return;
    setBusyId(alertId);
    try {
      await adminDelete(`/alerts/${encodeURIComponent(alertId)}`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(() => {
    if (!alerts) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return alerts;
    return alerts.filter(
      (a) =>
        a.berth_id.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.message.toLowerCase().includes(q),
    );
  }, [alerts, filter]);

  return (
    <div>
      <PageHeader
        title="Alerts"
        hint="Cross-harbor alert inbox. Acknowledge to clear from the live alert badge; delete only if the row is truly noise (loses audit trail)."
        actions={
          <>
            <Button onClick={refresh} variant="secondary">
              Refresh
            </Button>
            <Button
              onClick={() => setShowAcked((v) => !v)}
              variant={showAcked ? "secondary" : "primary"}
            >
              {showAcked ? "Hide ack'd" : "Show ack'd"}
            </Button>
          </>
        }
      />

      <div className="mb-4 max-w-sm">
        <FilterInput
          value={filter}
          onChange={setFilter}
          placeholder="Filter berth / type / message…"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {visible === null ? (
        <div className="text-sm text-brand-navy/50">Loading…</div>
      ) : (
        <Table
          head={["When", "Berth", "Type", "Message", "Status", ""]}
          rows={visible.map((a) => ({
            key: a.alert_id,
            tone: a.acknowledged ? "default" : "warn",
            cells: [
              fmtRelative(a.timestamp),
              a.berth_id,
              a.type.replace(/_/g, " "),
              <span key="msg" className="text-brand-navy/80">
                {a.message}
              </span>,
              a.acknowledged ? "acknowledged" : "active",
              <div key="actions" className="flex justify-end gap-2">
                {!a.acknowledged && (
                  <Button
                    variant="primary"
                    disabled={busyId === a.alert_id}
                    onClick={() => ack(a.alert_id)}
                  >
                    Acknowledge
                  </Button>
                )}
                <Button
                  variant="danger"
                  disabled={busyId === a.alert_id}
                  onClick={() => remove(a.alert_id)}
                >
                  Delete
                </Button>
              </div>,
            ],
          }))}
        />
      )}
    </div>
  );
}

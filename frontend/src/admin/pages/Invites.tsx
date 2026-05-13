import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminApiError, adminDelete, adminGet } from "../api";
import { Button } from "../components/Button";
import { FilterInput } from "../components/FilterInput";
import { PageHeader } from "../components/PageHeader";
import { Table } from "../components/Table";
import { fmtRelative } from "../format";

interface Invite {
  invite_id: string;
  berth_id: string;
  harbor_id: string;
  email: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface Harbor {
  harbor_id: string;
  name: string;
}

const STATUSES = ["pending", "accepted", "expired", "revoked", "rejected"];

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return `${err.status} — ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export function InvitesPage() {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [harbors, setHarbors] = useState<Harbor[]>([]);
  const [harborId, setHarborId] = useState("");
  const [status, setStatus] = useState("pending");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (harborId) params.set("harbor_id", harborId);
    if (status) params.set("status", status);
    try {
      setInvites(
        await adminGet<Invite[]>(`/berth-invites?${params.toString()}`),
      );
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [harborId, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    adminGet<Harbor[]>("/harbors")
      .then(setHarbors)
      .catch(() => {});
  }, []);

  async function revoke(inviteId: string) {
    if (!window.confirm(`Revoke invite ${inviteId}?`)) return;
    setBusyId(inviteId);
    try {
      await adminDelete(`/berth-invites/${encodeURIComponent(inviteId)}`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(() => {
    if (!invites) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return invites;
    return invites.filter(
      (i) =>
        i.email.toLowerCase().includes(q) ||
        i.berth_id.toLowerCase().includes(q),
    );
  }, [invites, filter]);

  return (
    <div>
      <PageHeader
        title="Berth invites"
        hint="Cross-harbor invite inbox. Revoke a pending invite to free the per-berth lock; expired/accepted rows are kept for audit."
        actions={
          <Button onClick={refresh} variant="secondary">
            Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={harborId}
          onChange={(e) => setHarborId(e.target.value)}
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
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <FilterInput
          value={filter}
          onChange={setFilter}
          placeholder="Filter email / berth…"
          className="max-w-sm"
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
          head={[
            "Created",
            "Harbor",
            "Berth",
            "Invitee",
            "Status",
            "Expires",
            "",
          ]}
          rows={visible.map((i) => ({
            key: i.invite_id,
            tone:
              i.status === "pending"
                ? "warn"
                : i.status === "accepted"
                  ? "ok"
                  : "default",
            cells: [
              fmtRelative(i.created_at),
              i.harbor_id,
              i.berth_id,
              i.email,
              i.status,
              fmtRelative(i.expires_at),
              <div key="actions" className="flex justify-end gap-2">
                <Button
                  variant="danger"
                  disabled={busyId === i.invite_id}
                  onClick={() => revoke(i.invite_id)}
                >
                  {i.status === "pending" ? "Revoke" : "Delete"}
                </Button>
              </div>,
            ],
          }))}
        />
      )}
    </div>
  );
}

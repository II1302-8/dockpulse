import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
} from "../api";
import { Button } from "../components/Button";
import { FilterInput } from "../components/FilterInput";
import { Input } from "../components/Input";
import { PageHeader } from "../components/PageHeader";
import { Table } from "../components/Table";
import { fmtRelative } from "../format";

interface Gateway {
  gateway_id: string;
  dock_id: string;
  name: string;
  status: string;
  last_seen: string | null;
  provision_ttl_s: number | null;
}

interface PendingGateway {
  gateway_id: string;
  first_seen_at: string;
  last_seen_at: string;
  attempts: number;
}

interface Snapshot {
  gateways: Gateway[];
  pending_gateways: PendingGateway[];
}

interface Dock {
  dock_id: string;
  harbor_id: string;
  name: string;
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return `${err.status} — ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

function parseTtl(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 10 && n <= 3600 ? n : null;
}

export function GatewaysPage() {
  const [gateways, setGateways] = useState<Gateway[] | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState<PendingGateway[]>([]);
  const [docks, setDocks] = useState<Dock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    gateway_id: "",
    dock_id: "",
    name: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    name: "",
    dock_id: "",
    provision_ttl_s: "",
  });

  const refresh = useCallback(async () => {
    try {
      const [snap, ds] = await Promise.all([
        adminGet<Snapshot>("/snapshot"),
        adminGet<Dock[]>("/docks"),
      ]);
      setGateways(snap.gateways);
      setPending(snap.pending_gateways);
      setDocks(ds);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function adoptPending(gatewayId: string) {
    setDraft({ gateway_id: gatewayId, dock_id: "", name: gatewayId });
    setCreating(true);
  }

  async function dismissPending(gatewayId: string) {
    if (
      !window.confirm(
        `Dismiss pending gateway ${gatewayId}? Drops the row; if it re-publishes status it will reappear.`,
      )
    ) {
      return;
    }
    setBusyId(`pending:${gatewayId}`);
    try {
      await adminDelete(`/gateways/pending/${encodeURIComponent(gatewayId)}`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function create() {
    setBusyId("__create__");
    try {
      await adminPost("/gateways", {
        gateway_id: draft.gateway_id.trim(),
        dock_id: draft.dock_id.trim(),
        name: draft.name.trim(),
      });
      setDraft({ gateway_id: "", dock_id: "", name: "" });
      setCreating(false);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(g: Gateway) {
    setEditingId(g.gateway_id);
    setEdit({
      name: g.name,
      dock_id: g.dock_id,
      provision_ttl_s: g.provision_ttl_s?.toString() ?? "",
    });
  }

  async function savePatch(gatewayId: string) {
    setBusyId(gatewayId);
    try {
      await adminPatch(`/gateways/${encodeURIComponent(gatewayId)}`, {
        name: edit.name.trim() || null,
        dock_id: edit.dock_id.trim() || null,
        provision_ttl_s: parseTtl(edit.provision_ttl_s),
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const visibleGateways = useMemo(() => {
    if (!gateways) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return gateways;
    return gateways.filter(
      (g) =>
        g.gateway_id.toLowerCase().includes(q) ||
        g.dock_id.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q),
    );
  }, [gateways, filter]);

  async function remove(gatewayId: string) {
    if (
      !window.confirm(
        `Delete gateway ${gatewayId}? Blocked if it has nodes attached.`,
      )
    ) {
      return;
    }
    setBusyId(gatewayId);
    try {
      await adminDelete(`/gateways/${encodeURIComponent(gatewayId)}`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Gateways"
        hint="Register gateways before their MQTT status messages will be honoured. Tune per-gateway provision TTL. Dismiss pending gateway IDs that never get adopted."
        actions={
          <>
            <Button onClick={refresh} variant="secondary">
              Refresh
            </Button>
            <Button onClick={() => setCreating((v) => !v)} variant="primary">
              {creating ? "Cancel" : "New gateway"}
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          className="mb-4 rounded-2xl border border-black/5 bg-white p-4"
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Input
              placeholder="gateway_id"
              required
              value={draft.gateway_id}
              onChange={(e) =>
                setDraft({ ...draft, gateway_id: e.target.value })
              }
            />
            <select
              required
              value={draft.dock_id}
              onChange={(e) => setDraft({ ...draft, dock_id: e.target.value })}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"
            >
              <option value="">— dock —</option>
              {docks.map((d) => (
                <option key={d.dock_id} value={d.dock_id}>
                  {d.name} ({d.dock_id})
                </option>
              ))}
            </select>
            <Input
              placeholder="name"
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busyId === "__create__"}
            >
              {busyId === "__create__" ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      )}

      {pending.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-brand-navy/60">
            Pending gateways
          </h2>
          <Table
            head={["Gateway", "First seen", "Last seen", "Attempts", ""]}
            rows={pending.map((p) => ({
              key: `pending:${p.gateway_id}`,
              tone: "warn",
              cells: [
                p.gateway_id,
                fmtRelative(p.first_seen_at),
                fmtRelative(p.last_seen_at),
                String(p.attempts),
                <div key="actions" className="flex justify-end gap-2">
                  <Button
                    variant="primary"
                    onClick={() => adoptPending(p.gateway_id)}
                    tooltip="Open the create form prefilled with this gateway_id"
                  >
                    Adopt
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busyId === `pending:${p.gateway_id}`}
                    onClick={() => dismissPending(p.gateway_id)}
                  >
                    Dismiss
                  </Button>
                </div>,
              ],
            }))}
          />
        </div>
      )}

      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-brand-navy/60">
          Registered gateways
        </h2>
        <FilterInput
          value={filter}
          onChange={setFilter}
          placeholder="Filter id / dock / name…"
          className="max-w-xs"
        />
      </div>
      {gateways === null ? (
        <div className="text-sm text-brand-navy/50">Loading…</div>
      ) : (
        <Table
          head={["ID", "Dock", "Name", "Status", "Last seen", "TTL", ""]}
          rows={visibleGateways.map((g) => {
            const isEditing = editingId === g.gateway_id;
            return {
              key: g.gateway_id,
              tone: g.status === "online" ? "ok" : "warn",
              cells: [
                g.gateway_id,
                isEditing ? (
                  <select
                    key="dock"
                    value={edit.dock_id}
                    onChange={(e) =>
                      setEdit({ ...edit, dock_id: e.target.value })
                    }
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"
                  >
                    {docks.map((d) => (
                      <option key={d.dock_id} value={d.dock_id}>
                        {d.dock_id}
                      </option>
                    ))}
                  </select>
                ) : (
                  g.dock_id
                ),
                isEditing ? (
                  <Input
                    key="name"
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                ) : (
                  g.name
                ),
                g.status,
                fmtRelative(g.last_seen),
                isEditing ? (
                  <Input
                    key="ttl"
                    placeholder="10..3600"
                    value={edit.provision_ttl_s}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        provision_ttl_s: e.target.value,
                      })
                    }
                  />
                ) : (
                  (g.provision_ttl_s?.toString() ?? "default")
                ),
                <div key="actions" className="flex justify-end gap-2">
                  {isEditing ? (
                    <>
                      <Button onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button
                        variant="primary"
                        disabled={busyId === g.gateway_id}
                        onClick={() => savePatch(g.gateway_id)}
                      >
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => startEdit(g)}>Edit</Button>
                      <Button
                        variant="danger"
                        disabled={busyId === g.gateway_id}
                        onClick={() => remove(g.gateway_id)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>,
              ],
            };
          })}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  adminPut,
} from "../api";
import { Button } from "../components/Button";
import { FilterInput } from "../components/FilterInput";
import { Input } from "../components/Input";
import { PageHeader } from "../components/PageHeader";
import { Table } from "../components/Table";

type BerthStatus = "free" | "occupied";

interface Berth {
  berth_id: string;
  dock_id: string;
  label: string | null;
  length_m: number | null;
  width_m: number | null;
  depth_m: number | null;
  status: BerthStatus;
  is_reserved: boolean;
  sensor_status: BerthStatus | null;
  manual_status: BerthStatus | null;
  manual_status_locked: boolean;
  manual_status_set_by: string | null;
  manual_status_set_at: string | null;
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

function parseNum(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function BerthsPage() {
  const [rows, setRows] = useState<Berth[] | null>(null);
  const [filter, setFilter] = useState("");
  const [docks, setDocks] = useState<Dock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    berth_id: "",
    dock_id: "",
    label: "",
    length_m: "",
    width_m: "",
    depth_m: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    label: "",
    length_m: "",
    width_m: "",
    depth_m: "",
    is_reserved: false,
  });
  const [overrideDraft, setOverrideDraft] = useState<
    Record<string, { status: BerthStatus; locked: boolean }>
  >({});

  const refresh = useCallback(async () => {
    try {
      const [berths, ds] = await Promise.all([
        adminGet<Berth[]>("/berths"),
        adminGet<Dock[]>("/docks"),
      ]);
      setRows(berths);
      setDocks(ds);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create() {
    setBusyId("__create__");
    try {
      await adminPost("/berths", {
        berth_id: draft.berth_id.trim(),
        dock_id: draft.dock_id.trim(),
        label: draft.label.trim() || null,
        length_m: parseNum(draft.length_m),
        width_m: parseNum(draft.width_m),
        depth_m: parseNum(draft.depth_m),
      });
      setDraft({
        berth_id: "",
        dock_id: "",
        label: "",
        length_m: "",
        width_m: "",
        depth_m: "",
      });
      setCreating(false);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(b: Berth) {
    setEditingId(b.berth_id);
    setEdit({
      label: b.label ?? "",
      length_m: b.length_m?.toString() ?? "",
      width_m: b.width_m?.toString() ?? "",
      depth_m: b.depth_m?.toString() ?? "",
      is_reserved: b.is_reserved,
    });
  }

  async function savePatch(berthId: string) {
    setBusyId(berthId);
    try {
      await adminPatch(`/berths/${encodeURIComponent(berthId)}`, {
        label: edit.label.trim() || null,
        length_m: parseNum(edit.length_m),
        width_m: parseNum(edit.width_m),
        depth_m: parseNum(edit.depth_m),
        is_reserved: edit.is_reserved,
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.berth_id.toLowerCase().includes(q) ||
        r.dock_id.toLowerCase().includes(q) ||
        (r.label ?? "").toLowerCase().includes(q),
    );
  }, [rows, filter]);

  async function remove(berthId: string) {
    if (
      !window.confirm(
        `Delete berth ${berthId}? Blocked if it has nodes attached.`,
      )
    ) {
      return;
    }
    setBusyId(berthId);
    try {
      await adminDelete(`/berths/${encodeURIComponent(berthId)}`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function resetStatus(berthId: string) {
    if (
      !window.confirm(
        `Force-reset berth ${berthId} to status=free (clears sensor_raw)?`,
      )
    ) {
      return;
    }
    setBusyId(berthId);
    try {
      await adminPost(`/berths/${encodeURIComponent(berthId)}/reset`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function overrideFor(b: Berth): { status: BerthStatus; locked: boolean } {
    return (
      overrideDraft[b.berth_id] ?? {
        // default the draft to the inverse of effective status so clicking Apply
        // actually does something noticeable. lock defaults true (sticky)
        status: b.status === "occupied" ? "free" : "occupied",
        locked: true,
      }
    );
  }

  async function applyOverride(berthId: string) {
    setBusyId(berthId);
    try {
      const draft = overrideFor({ berth_id: berthId } as Berth);
      await adminPut(`/berths/${encodeURIComponent(berthId)}/manual-status`, {
        status: draft.status,
        locked: draft.locked,
      });
      setOverrideDraft((prev) => {
        const { [berthId]: _gone, ...rest } = prev;
        return rest;
      });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function clearOverride(berthId: string) {
    setBusyId(berthId);
    try {
      await adminDelete(`/berths/${encodeURIComponent(berthId)}/manual-status`);
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
        title="Berths"
        hint="Create berths under a dock with label and dimensions. Reset clears a stuck status back to free."
        actions={
          <>
            <Button onClick={refresh} variant="secondary">
              Refresh
            </Button>
            <Button onClick={() => setCreating((v) => !v)} variant="primary">
              {creating ? "Cancel" : "New berth"}
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Input
              placeholder="berth_id"
              required
              value={draft.berth_id}
              onChange={(e) => setDraft({ ...draft, berth_id: e.target.value })}
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
              placeholder="label"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
            <Input
              placeholder="length m"
              value={draft.length_m}
              onChange={(e) => setDraft({ ...draft, length_m: e.target.value })}
            />
            <Input
              placeholder="width m"
              value={draft.width_m}
              onChange={(e) => setDraft({ ...draft, width_m: e.target.value })}
            />
            <Input
              placeholder="depth m"
              value={draft.depth_m}
              onChange={(e) => setDraft({ ...draft, depth_m: e.target.value })}
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

      <div className="mb-4 max-w-sm">
        <FilterInput
          value={filter}
          onChange={setFilter}
          placeholder="Filter id / dock / label…"
        />
      </div>

      {rows === null ? (
        <div className="text-sm text-brand-navy/50">Loading…</div>
      ) : (
        <Table
          head={[
            "ID",
            "Dock",
            "Label",
            "Dim (L×W×D)",
            "Status / override",
            "Reserved",
            "",
          ]}
          rows={visible.map((b) => {
            const isEditing = editingId === b.berth_id;
            const dims = `${b.length_m ?? "—"}×${b.width_m ?? "—"}×${b.depth_m ?? "—"}`;
            const draft = overrideFor(b);
            const overrideActive = b.manual_status !== null;
            const busy = busyId === b.berth_id;
            return {
              key: b.berth_id,
              tone:
                b.status === "occupied"
                  ? "warn"
                  : b.is_reserved
                    ? "ok"
                    : "default",
              cells: [
                b.berth_id,
                b.dock_id,
                isEditing ? (
                  <Input
                    key="label"
                    value={edit.label}
                    onChange={(e) =>
                      setEdit({ ...edit, label: e.target.value })
                    }
                  />
                ) : (
                  (b.label ?? "—")
                ),
                isEditing ? (
                  <div key="dims" className="flex gap-1">
                    <Input
                      placeholder="L"
                      className="w-14"
                      value={edit.length_m}
                      onChange={(e) =>
                        setEdit({ ...edit, length_m: e.target.value })
                      }
                    />
                    <Input
                      placeholder="W"
                      className="w-14"
                      value={edit.width_m}
                      onChange={(e) =>
                        setEdit({ ...edit, width_m: e.target.value })
                      }
                    />
                    <Input
                      placeholder="D"
                      className="w-14"
                      value={edit.depth_m}
                      onChange={(e) =>
                        setEdit({ ...edit, depth_m: e.target.value })
                      }
                    />
                  </div>
                ) : (
                  dims
                ),
                <div key="status" className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        b.status === "occupied"
                          ? "rounded-full bg-amber-500/10 px-2 py-0.5 font-bold uppercase text-amber-700"
                          : "rounded-full bg-emerald-500/10 px-2 py-0.5 font-bold uppercase text-emerald-700"
                      }
                    >
                      {b.status}
                    </span>
                    {overrideActive && (
                      <span
                        className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-brand-blue"
                        title={
                          b.manual_status_set_by
                            ? `set by ${b.manual_status_set_by}`
                            : undefined
                        }
                      >
                        manual{b.manual_status_locked ? " · locked" : ""}
                      </span>
                    )}
                    {b.sensor_status && overrideActive && (
                      <span className="text-[10px] text-brand-navy/50">
                        sensor: {b.sensor_status}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={draft.status}
                      disabled={busy}
                      onChange={(e) =>
                        setOverrideDraft((prev) => ({
                          ...prev,
                          [b.berth_id]: {
                            ...draft,
                            status: e.target.value as BerthStatus,
                          },
                        }))
                      }
                      className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px]"
                    >
                      <option value="free">free</option>
                      <option value="occupied">occupied</option>
                    </select>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={draft.locked}
                        disabled={busy}
                        onChange={(e) =>
                          setOverrideDraft((prev) => ({
                            ...prev,
                            [b.berth_id]: {
                              ...draft,
                              locked: e.target.checked,
                            },
                          }))
                        }
                      />
                      lock sensor
                    </label>
                    <Button
                      onClick={() => applyOverride(b.berth_id)}
                      disabled={busy}
                      tooltip={
                        draft.locked
                          ? "Pin this status, sensor cannot change it"
                          : "Pre-stage this status, next sensor reading wins"
                      }
                    >
                      Apply
                    </Button>
                    {overrideActive && (
                      <Button
                        onClick={() => clearOverride(b.berth_id)}
                        disabled={busy}
                        variant="secondary"
                        tooltip="Drop override, show sensor truth"
                      >
                        Revert
                      </Button>
                    )}
                  </div>
                </div>,
                isEditing ? (
                  <label
                    key="reserved"
                    className="flex items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={edit.is_reserved}
                      onChange={(e) =>
                        setEdit({ ...edit, is_reserved: e.target.checked })
                      }
                    />
                    reserved
                  </label>
                ) : b.is_reserved ? (
                  "yes"
                ) : (
                  "no"
                ),
                <div key="actions" className="flex justify-end gap-2">
                  {isEditing ? (
                    <>
                      <Button onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => savePatch(b.berth_id)}
                      >
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() => resetStatus(b.berth_id)}
                        tooltip="Force status=free, clear sensor_raw and any override"
                      >
                        Reset
                      </Button>
                      <Button onClick={() => startEdit(b)}>Edit</Button>
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() => remove(b.berth_id)}
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

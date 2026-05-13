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

interface Berth {
  berth_id: string;
  dock_id: string;
  label: string | null;
  length_m: number | null;
  width_m: number | null;
  depth_m: number | null;
  status: string;
  is_reserved: boolean;
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
            "Status",
            "Reserved",
            "",
          ]}
          rows={visible.map((b) => {
            const isEditing = editingId === b.berth_id;
            const dims = `${b.length_m ?? "—"}×${b.width_m ?? "—"}×${b.depth_m ?? "—"}`;
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
                b.status,
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
                        disabled={busyId === b.berth_id}
                        onClick={() => savePatch(b.berth_id)}
                      >
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        disabled={busyId === b.berth_id}
                        onClick={() => resetStatus(b.berth_id)}
                        tooltip="Force status=free and clear sensor_raw"
                      >
                        Reset
                      </Button>
                      <Button onClick={() => startEdit(b)}>Edit</Button>
                      <Button
                        variant="danger"
                        disabled={busyId === b.berth_id}
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

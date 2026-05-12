import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
} from "../api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageHeader } from "../components/PageHeader";
import { Table } from "../components/Table";

interface Dock {
  dock_id: string;
  harbor_id: string;
  name: string;
}

interface Harbor {
  harbor_id: string;
  name: string;
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return `${err.status} — ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export function DocksPage() {
  const [rows, setRows] = useState<Dock[] | null>(null);
  const [harbors, setHarbors] = useState<Harbor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    dock_id: "",
    harbor_id: "",
    name: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", harbor_id: "" });

  const refresh = useCallback(async () => {
    try {
      const [docks, hs] = await Promise.all([
        adminGet<Dock[]>("/docks"),
        adminGet<Harbor[]>("/harbors"),
      ]);
      setRows(docks);
      setHarbors(hs);
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
      await adminPost<Dock>("/docks", {
        dock_id: draft.dock_id.trim(),
        harbor_id: draft.harbor_id.trim(),
        name: draft.name.trim(),
      });
      setDraft({ dock_id: "", harbor_id: "", name: "" });
      setCreating(false);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(d: Dock) {
    setEditingId(d.dock_id);
    setEdit({ name: d.name, harbor_id: d.harbor_id });
  }

  async function savePatch(dockId: string) {
    setBusyId(dockId);
    try {
      await adminPatch(`/docks/${encodeURIComponent(dockId)}`, {
        name: edit.name.trim() || null,
        harbor_id: edit.harbor_id.trim() || null,
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(dockId: string) {
    if (
      !window.confirm(
        `Delete dock ${dockId}? Blocked if it has berths or a gateway.`,
      )
    ) {
      return;
    }
    setBusyId(dockId);
    try {
      await adminDelete(`/docks/${encodeURIComponent(dockId)}`);
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
        title="Docks"
        hint="Manage docks per harbor. Reassign to a different harbor or delete (when empty of berths and gateways)."
        actions={
          <>
            <Button onClick={refresh} variant="secondary">
              Refresh
            </Button>
            <Button onClick={() => setCreating((v) => !v)} variant="primary">
              {creating ? "Cancel" : "New dock"}
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
              placeholder="dock_id"
              required
              value={draft.dock_id}
              onChange={(e) => setDraft({ ...draft, dock_id: e.target.value })}
            />
            <select
              required
              value={draft.harbor_id}
              onChange={(e) =>
                setDraft({ ...draft, harbor_id: e.target.value })
              }
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            >
              <option value="">— harbor —</option>
              {harbors.map((h) => (
                <option key={h.harbor_id} value={h.harbor_id}>
                  {h.name} ({h.harbor_id})
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

      {rows === null ? (
        <div className="text-sm text-brand-navy/50">Loading…</div>
      ) : (
        <Table
          head={["ID", "Harbor", "Name", ""]}
          rows={rows.map((d) => {
            const isEditing = editingId === d.dock_id;
            return {
              key: d.dock_id,
              cells: [
                d.dock_id,
                isEditing ? (
                  <select
                    key="harbor"
                    value={edit.harbor_id}
                    onChange={(e) =>
                      setEdit({ ...edit, harbor_id: e.target.value })
                    }
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"
                  >
                    {harbors.map((h) => (
                      <option key={h.harbor_id} value={h.harbor_id}>
                        {h.harbor_id}
                      </option>
                    ))}
                  </select>
                ) : (
                  d.harbor_id
                ),
                isEditing ? (
                  <Input
                    key="name"
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                ) : (
                  d.name
                ),
                <div key="actions" className="flex justify-end gap-2">
                  {isEditing ? (
                    <>
                      <Button onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button
                        variant="primary"
                        disabled={busyId === d.dock_id}
                        onClick={() => savePatch(d.dock_id)}
                      >
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => startEdit(d)}>Edit</Button>
                      <Button
                        variant="danger"
                        disabled={busyId === d.dock_id}
                        onClick={() => remove(d.dock_id)}
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

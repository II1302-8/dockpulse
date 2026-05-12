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

interface Harbor {
  harbor_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return `${err.status} — ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

function parseCoord(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function HarborsPage() {
  const [rows, setRows] = useState<Harbor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    harbor_id: "",
    name: "",
    lat: "",
    lng: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", lat: "", lng: "" });

  const refresh = useCallback(async () => {
    try {
      setRows(await adminGet<Harbor[]>("/harbors"));
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
      await adminPost<Harbor>("/harbors", {
        harbor_id: draft.harbor_id.trim(),
        name: draft.name.trim(),
        lat: parseCoord(draft.lat),
        lng: parseCoord(draft.lng),
      });
      setDraft({ harbor_id: "", name: "", lat: "", lng: "" });
      setCreating(false);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(h: Harbor) {
    setEditingId(h.harbor_id);
    setEdit({
      name: h.name,
      lat: h.lat?.toString() ?? "",
      lng: h.lng?.toString() ?? "",
    });
  }

  async function savePatch(harborId: string) {
    setBusyId(harborId);
    try {
      await adminPatch(`/harbors/${encodeURIComponent(harborId)}`, {
        name: edit.name.trim() || null,
        lat: parseCoord(edit.lat),
        lng: parseCoord(edit.lng),
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(harborId: string) {
    if (
      !window.confirm(`Delete harbor ${harborId}? Blocked if it has docks.`)
    ) {
      return;
    }
    setBusyId(harborId);
    try {
      await adminDelete(`/harbors/${encodeURIComponent(harborId)}`);
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
        title="Harbors"
        hint="Create, rename, relocate harbors. Cascade-delete is blocked when child docks exist."
        actions={
          <>
            <Button onClick={refresh} variant="secondary">
              Refresh
            </Button>
            <Button onClick={() => setCreating((v) => !v)} variant="primary">
              {creating ? "Cancel" : "New harbor"}
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Input
              placeholder="harbor_id"
              required
              value={draft.harbor_id}
              onChange={(e) =>
                setDraft({ ...draft, harbor_id: e.target.value })
              }
            />
            <Input
              placeholder="name"
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              placeholder="lat (optional)"
              value={draft.lat}
              onChange={(e) => setDraft({ ...draft, lat: e.target.value })}
            />
            <Input
              placeholder="lng (optional)"
              value={draft.lng}
              onChange={(e) => setDraft({ ...draft, lng: e.target.value })}
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
          head={["ID", "Name", "Lat", "Lng", ""]}
          rows={rows.map((h) => {
            const isEditing = editingId === h.harbor_id;
            return {
              key: h.harbor_id,
              cells: [
                h.harbor_id,
                isEditing ? (
                  <Input
                    key="name"
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                ) : (
                  h.name
                ),
                isEditing ? (
                  <Input
                    key="lat"
                    placeholder="lat"
                    value={edit.lat}
                    onChange={(e) => setEdit({ ...edit, lat: e.target.value })}
                  />
                ) : (
                  (h.lat?.toString() ?? "—")
                ),
                isEditing ? (
                  <Input
                    key="lng"
                    placeholder="lng"
                    value={edit.lng}
                    onChange={(e) => setEdit({ ...edit, lng: e.target.value })}
                  />
                ) : (
                  (h.lng?.toString() ?? "—")
                ),
                <div key="actions" className="flex justify-end gap-2">
                  {isEditing ? (
                    <>
                      <Button onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button
                        variant="primary"
                        disabled={busyId === h.harbor_id}
                        onClick={() => savePatch(h.harbor_id)}
                      >
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => startEdit(h)}>Edit</Button>
                      <Button
                        variant="danger"
                        disabled={busyId === h.harbor_id}
                        onClick={() => remove(h.harbor_id)}
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

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

interface User {
  user_id: string;
  email: string;
  firstname: string;
  lastname: string;
  role: string;
  email_verified: boolean;
  phone: string | null;
  boat_club: string | null;
}

interface Harbor {
  harbor_id: string;
  name: string;
}

interface Grant {
  harbor_id: string;
  role: string;
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return `${err.status} — ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [filter, setFilter] = useState("");
  const [harbors, setHarbors] = useState<Harbor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    email: "",
    password: "",
    firstname: "",
    lastname: "",
    phone: "",
    boat_club: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    firstname: "",
    lastname: "",
    phone: "",
    boat_club: "",
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [grantHarborId, setGrantHarborId] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [us, hs] = await Promise.all([
        adminGet<User[]>("/users"),
        adminGet<Harbor[]>("/harbors"),
      ]);
      setUsers(us);
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
      await adminPost("/users", {
        email: draft.email.trim(),
        password: draft.password,
        firstname: draft.firstname.trim(),
        lastname: draft.lastname.trim(),
        phone: draft.phone.trim() || null,
        boat_club: draft.boat_club.trim() || null,
      });
      setDraft({
        email: "",
        password: "",
        firstname: "",
        lastname: "",
        phone: "",
        boat_club: "",
      });
      setCreating(false);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(u: User) {
    setEditingId(u.user_id);
    setEdit({
      firstname: u.firstname,
      lastname: u.lastname,
      phone: u.phone ?? "",
      boat_club: u.boat_club ?? "",
    });
  }

  async function savePatch(userId: string) {
    setBusyId(userId);
    try {
      await adminPatch(`/users/${encodeURIComponent(userId)}`, {
        firstname: edit.firstname.trim() || null,
        lastname: edit.lastname.trim() || null,
        phone: edit.phone.trim() || null,
        boat_club: edit.boat_club.trim() || null,
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
    if (!users) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.firstname.toLowerCase().includes(q) ||
        u.lastname.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [users, filter]);

  async function remove(userId: string) {
    if (
      !window.confirm(
        `Delete user ${userId}? Blocked if they have assignments or adoption history.`,
      )
    ) {
      return;
    }
    setBusyId(userId);
    try {
      await adminDelete(`/users/${encodeURIComponent(userId)}`);
      if (expandedId === userId) setExpandedId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function loadGrants(userId: string) {
    try {
      const g = await adminGet<Grant[]>(
        `/users/${encodeURIComponent(userId)}/harbor-grants`,
      );
      setGrants(g);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function toggleExpand(userId: string) {
    if (expandedId === userId) {
      setExpandedId(null);
      setGrants([]);
      return;
    }
    setExpandedId(userId);
    setGrantHarborId("");
    await loadGrants(userId);
  }

  async function grant(userId: string) {
    if (!grantHarborId) return;
    setBusyId(`grant:${userId}`);
    try {
      await adminPost(`/users/${encodeURIComponent(userId)}/harbor-grants`, {
        harbor_id: grantHarborId,
      });
      await loadGrants(userId);
      await refresh();
      setGrantHarborId("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function verifyEmail(userId: string) {
    setBusyId(userId);
    try {
      await adminPost(`/users/${encodeURIComponent(userId)}/verify-email`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(userId: string, harborId: string) {
    if (!window.confirm(`Revoke harbormaster on ${harborId}?`)) return;
    setBusyId(`revoke:${userId}:${harborId}`);
    try {
      await adminDelete(
        `/users/${encodeURIComponent(userId)}/harbor-grants/${encodeURIComponent(harborId)}`,
      );
      await loadGrants(userId);
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
        title="Users"
        hint="Create accounts and grant per-harbor harbormaster authority. Boat-owner is the default role; promotion happens via harbor grants."
        actions={
          <>
            <Button onClick={refresh} variant="secondary">
              Refresh
            </Button>
            <Button onClick={() => setCreating((v) => !v)} variant="primary">
              {creating ? "Cancel" : "New user"}
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
              type="email"
              placeholder="email"
              required
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <Input
              type="password"
              placeholder="password (min 8)"
              required
              minLength={8}
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            />
            <Input
              placeholder="first name"
              required
              value={draft.firstname}
              onChange={(e) =>
                setDraft({ ...draft, firstname: e.target.value })
              }
            />
            <Input
              placeholder="last name"
              required
              value={draft.lastname}
              onChange={(e) => setDraft({ ...draft, lastname: e.target.value })}
            />
            <Input
              placeholder="phone (optional)"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
            <Input
              placeholder="boat club (optional)"
              value={draft.boat_club}
              onChange={(e) =>
                setDraft({ ...draft, boat_club: e.target.value })
              }
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
          placeholder="Filter email / name / role…"
        />
      </div>

      {users === null ? (
        <div className="text-sm text-brand-navy/50">Loading…</div>
      ) : (
        <div className="space-y-4">
          <Table
            head={[
              "Email",
              "Name",
              "Role",
              "Verified",
              "Phone",
              "Boat club",
              "",
            ]}
            rows={visible.map((u) => {
              const isEditing = editingId === u.user_id;
              const isExpanded = expandedId === u.user_id;
              return {
                key: u.user_id,
                tone: u.role === "harbormaster" ? "ok" : "default",
                cells: [
                  u.email,
                  isEditing ? (
                    <div key="name" className="flex gap-1">
                      <Input
                        placeholder="first"
                        className="w-24"
                        value={edit.firstname}
                        onChange={(e) =>
                          setEdit({ ...edit, firstname: e.target.value })
                        }
                      />
                      <Input
                        placeholder="last"
                        className="w-24"
                        value={edit.lastname}
                        onChange={(e) =>
                          setEdit({ ...edit, lastname: e.target.value })
                        }
                      />
                    </div>
                  ) : (
                    `${u.firstname} ${u.lastname}`
                  ),
                  u.role,
                  u.email_verified ? (
                    <span key="verified" className="text-emerald-600">
                      verified
                    </span>
                  ) : (
                    <Button
                      key="verify"
                      variant="primary"
                      disabled={busyId === u.user_id}
                      onClick={() => verifyEmail(u.user_id)}
                      tooltip="Flip email_verified to true (admin escape hatch)"
                    >
                      Mark verified
                    </Button>
                  ),
                  isEditing ? (
                    <Input
                      key="phone"
                      value={edit.phone}
                      onChange={(e) =>
                        setEdit({ ...edit, phone: e.target.value })
                      }
                    />
                  ) : (
                    (u.phone ?? "—")
                  ),
                  isEditing ? (
                    <Input
                      key="club"
                      value={edit.boat_club}
                      onChange={(e) =>
                        setEdit({ ...edit, boat_club: e.target.value })
                      }
                    />
                  ) : (
                    (u.boat_club ?? "—")
                  ),
                  <div key="actions" className="flex justify-end gap-2">
                    {isEditing ? (
                      <>
                        <Button onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          disabled={busyId === u.user_id}
                          onClick={() => savePatch(u.user_id)}
                        >
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={() => toggleExpand(u.user_id)}>
                          {isExpanded ? "Hide grants" : "Grants"}
                        </Button>
                        <Button onClick={() => startEdit(u)}>Edit</Button>
                        <Button
                          variant="danger"
                          disabled={busyId === u.user_id}
                          onClick={() => remove(u.user_id)}
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

          {expandedId && (
            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-brand-navy/60">
                Harbor grants for {expandedId}
              </h3>
              {grants.length === 0 ? (
                <p className="mb-3 text-xs text-brand-navy/40">
                  No grants. User is a boat-owner.
                </p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {grants.map((g) => (
                    <li
                      key={`${expandedId}:${g.harbor_id}`}
                      className="flex items-center justify-between rounded-xl bg-brand-navy/5 px-3 py-2 text-xs"
                    >
                      <span className="font-mono">
                        {g.harbor_id} · {g.role}
                      </span>
                      <Button
                        variant="danger"
                        disabled={
                          busyId === `revoke:${expandedId}:${g.harbor_id}`
                        }
                        onClick={() => revoke(expandedId, g.harbor_id)}
                      >
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <select
                  value={grantHarborId}
                  onChange={(e) => setGrantHarborId(e.target.value)}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"
                >
                  <option value="">— grant harbor —</option>
                  {harbors.map((h) => (
                    <option key={h.harbor_id} value={h.harbor_id}>
                      {h.name} ({h.harbor_id})
                    </option>
                  ))}
                </select>
                <Button
                  variant="primary"
                  disabled={!grantHarborId || busyId === `grant:${expandedId}`}
                  onClick={() => grant(expandedId)}
                >
                  Grant harbormaster
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { AuthOutletContext } from "../components/layout/MainLayout";
import {
  type BerthInvite,
  createInvite,
  revokeInvite,
  useBerthInvites,
} from "../hooks/useBerthInvites";
import { fmtDate } from "../lib/date";

function statusBadgeClass(status: BerthInvite["status"]) {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "accepted":
      return "bg-emerald-100 text-emerald-700";
    case "rejected":
    case "revoked":
      return "bg-slate-100 text-slate-600";
    case "expired":
      return "bg-red-50 text-red-600";
  }
}

function InvitesSettings() {
  const { user } = useOutletContext<AuthOutletContext>();
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  // BerthDetailPanel uses the same fallback so we stay consistent
  const harborId =
    (user as { harbor_id?: string | null } | null)?.harbor_id ??
    marinaSlug ??
    null;

  const { invites, isLoading, error, loadInvites } = useBerthInvites(harborId, {
    enabled: Boolean(harborId),
  });

  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Berth invites | DockPulse";
  }, []);

  if (!user || user.role !== "harbormaster") {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-24 pb-20 lg:pt-36">
        <h1 className="text-3xl font-semibold text-brand-navy">
          Berth invites
        </h1>
        <p className="mt-2 text-brand-navy/60">Harbormaster role required.</p>
      </main>
    );
  }

  async function handleRevoke(invite: BerthInvite) {
    if (!harborId) return;
    setBusyId(invite.invite_id);
    const result = await revokeInvite(harborId, invite.invite_id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Invite revoked.");
    await loadInvites();
  }

  async function handleResend(invite: BerthInvite) {
    if (!harborId) return;
    setBusyId(invite.invite_id);
    // resend = revoke prior + create new with same email/berth
    const revoked = await revokeInvite(harborId, invite.invite_id);
    if (!revoked.ok) {
      setBusyId(null);
      toast.error(revoked.error);
      return;
    }
    const created = await createInvite(harborId, invite.berth_id, invite.email);
    setBusyId(null);
    if (!created.ok) {
      toast.error(created.error);
      return;
    }
    toast.success("Invite resent.");
    await loadInvites();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pt-24 pb-20 lg:pt-36">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-brand-navy">
            Berth invites
          </h1>
          <p className="mt-1 text-brand-navy/60">
            Track outstanding invitations to claim berths.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadInvites()}
          className="rounded-full bg-brand-navy/5 p-2 text-brand-navy/60 transition-colors hover:bg-brand-navy/10"
          aria-label="Refresh invites"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {isLoading && invites.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-brand-navy/40" size={24} />
        </div>
      ) : error ? (
        <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-600">
          {error}
        </p>
      ) : invites.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm font-bold text-brand-navy/40">
          No invites yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-widest text-brand-navy/60">
              <tr>
                <th className="px-4 py-3">Berth</th>
                <th className="px-4 py-3">Invitee</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invites.map((invite) => {
                const isBusy = busyId === invite.invite_id;
                const canAct = invite.status === "pending";
                return (
                  <tr key={invite.invite_id}>
                    <td className="px-4 py-3 font-bold text-brand-navy">
                      {invite.berth_label || invite.berth_id}
                    </td>
                    <td className="px-4 py-3 text-brand-navy/70">
                      {invite.email}
                    </td>
                    <td className="px-4 py-3 text-brand-navy/70">
                      {fmtDate(invite.expires_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-black uppercase tracking-widest ${statusBadgeClass(
                          invite.status,
                        )}`}
                      >
                        {invite.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canAct ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleResend(invite)}
                            className="rounded-full bg-brand-blue/10 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-brand-blue transition-colors hover:bg-brand-blue/20 disabled:opacity-50"
                          >
                            Resend
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRevoke(invite)}
                            className="grid h-7 w-7 place-items-center rounded-full bg-red-500/10 text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                            aria-label="Revoke invite"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-brand-navy/30">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export { InvitesSettings };

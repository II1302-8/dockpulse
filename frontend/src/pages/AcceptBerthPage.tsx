import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
import type { AuthOutletContext } from "../components/layout/MainLayout";
import {
  acceptInviteByToken,
  getInviteByToken,
  type InviteByToken,
  rejectInviteByToken,
} from "../hooks/useBerthInvites";
import { useAuth } from "../lib/auth-context";
import { fmtDateTime } from "../lib/date";

function sameEmail(a?: string | null, b?: string | null) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

export function AcceptBerthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const { user, openAuthDialog } = useOutletContext<AuthOutletContext>();
  const { logout, refresh } = useAuth();

  const [invite, setInvite] = useState<InviteByToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token) {
        setError("Missing invite token.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const result = await getInviteByToken(token);

      if (!result.ok) {
        setError(
          result.status === 404
            ? "This invite link does not exist."
            : result.status === 410
              ? "This invite is expired, revoked, rejected, or already used."
              : result.error,
        );
        setIsLoading(false);
        return;
      }

      setInvite(result.invite);
      setIsLoading(false);
    }

    load();
  }, [token]);

  useEffect(() => {
    if (!invite || user) return;

    openAuthDialog({
      prefillEmail: invite.email,
      lockEmail: true,
      defaultTab: "signup",
    });
  }, [invite, user, openAuthDialog]);

  async function handleAccept() {
    if (!token || !invite) return;

    const assignedBerthId = user?.assigned_berth_id;

    if (
      assignedBerthId &&
      assignedBerthId !== invite.berth_id &&
      !confirmRelease
    ) {
      setConfirmRelease(true);
      return;
    }

    setIsSubmitting(true);

    const result = await acceptInviteByToken(token);

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await refresh();
    toast.success("Berth invite accepted.");
    // root redirects to the configured marina dashboard via App.tsx
    navigate("/", { replace: true });
  }

  async function handleReject() {
    if (!token) return;

    setIsSubmitting(true);
    const result = await rejectInviteByToken(token);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Invite rejected.");
    navigate("/", { replace: true });
  }

  async function signOutAndContinue() {
    await logout();
    openAuthDialog({
      prefillEmail: invite?.email,
      lockEmail: true,
      defaultTab: "signup",
    });
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-16 font-body">
      <div className="mx-auto max-w-xl rounded-[32px] border border-white bg-white/90 p-8 shadow-deep">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-12 text-brand-navy/50">
            <Loader2 className="animate-spin" size={32} />
            <p className="text-xs font-black uppercase tracking-widest">
              Loading invite...
            </p>
          </div>
        ) : error ? (
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-500">
              <XCircle size={32} />
            </div>
            <h1 className="text-xl font-black text-brand-navy">
              Invite unavailable
            </h1>
            <p className="mt-3 text-sm font-medium text-brand-navy/60">
              {error}
            </p>
          </div>
        ) : invite ? (
          <div>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-brand-blue/10 text-brand-blue">
                <CheckCircle2 size={32} />
              </div>

              <h1 className="text-2xl font-black uppercase tracking-tight text-brand-navy">
                Berth Invitation
              </h1>

              <p className="mt-2 text-sm font-bold text-brand-navy/50">
                You have been invited to claim a berth.
              </p>
            </div>

            <div className="space-y-3 rounded-3xl bg-slate-50 p-5 text-sm">
              <p>
                <span className="font-black text-brand-navy">Harbor:</span>{" "}
                {invite.harbor_name}
              </p>
              <p>
                <span className="font-black text-brand-navy">Berth:</span>{" "}
                {invite.berth_label}
              </p>
              <p>
                <span className="font-black text-brand-navy">Invitee:</span>{" "}
                {invite.email}
              </p>
              <p>
                <span className="font-black text-brand-navy">Expires:</span>{" "}
                {fmtDateTime(invite.expires_at)}
              </p>
            </div>

            {!user ? (
              <div className="mt-6 rounded-2xl bg-brand-blue/5 p-4 text-center">
                <p className="text-sm font-bold text-brand-navy/70">
                  Sign up or log in with {invite.email} to continue.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    openAuthDialog({
                      prefillEmail: invite.email,
                      lockEmail: true,
                      defaultTab: "signup",
                    })
                  }
                  className="mt-4 rounded-full bg-brand-blue px-6 py-3 text-xs font-black uppercase tracking-widest text-white"
                >
                  Continue
                </button>
              </div>
            ) : !sameEmail(user.email, invite.email) ? (
              <div className="mt-6 rounded-2xl bg-yellow-50 p-4">
                <p className="text-sm font-bold text-yellow-800">
                  This invite is for {invite.email}, but you are signed in as{" "}
                  {user.email}.
                </p>

                <button
                  type="button"
                  onClick={signOutAndContinue}
                  className="mt-4 rounded-full bg-yellow-500 px-6 py-3 text-xs font-black uppercase tracking-widest text-white"
                >
                  Sign out and continue
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {confirmRelease && (
                  <div className="flex gap-3 rounded-2xl bg-red-50 p-4 text-red-700">
                    <AlertTriangle size={20} className="shrink-0" />
                    <p className="text-sm font-bold">
                      Accepting this invite will release your current berth.
                      Press Accept again to confirm.
                    </p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleReject}
                    className="rounded-2xl border border-slate-200 px-6 py-4 text-xs font-black uppercase tracking-widest text-brand-navy/60"
                  >
                    Reject
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleAccept}
                    className="rounded-2xl bg-gradient-to-r from-brand-blue to-brand-cyan px-6 py-4 text-xs font-black uppercase tracking-widest text-white"
                  >
                    {isSubmitting
                      ? "Working..."
                      : confirmRelease
                        ? "Confirm release"
                        : "Accept"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

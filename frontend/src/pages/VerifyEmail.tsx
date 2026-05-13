import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type State =
  | { phase: "loading" }
  | { phase: "ok" }
  | { phase: "error"; message: string };

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { refresh } = useAuth();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    document.title = "Verify email | DockPulse";
  }, []);

  useEffect(() => {
    async function run() {
      if (!token) {
        setState({ phase: "error", message: "Missing verification token." });
        return;
      }
      try {
        const res = await apiFetch(
          `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) {
          let detail = "Could not verify the link.";
          try {
            const data = await res.json();
            if (typeof data?.detail === "string") detail = data.detail;
          } catch {
            // not json, keep fallback
          }
          setState({ phase: "error", message: detail });
          return;
        }
        // if the user is already logged in, refresh /me so the banner clears
        await refresh().catch(() => {});
        setState({ phase: "ok" });
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Network error.",
        });
      }
    }
    run();
  }, [token, refresh]);

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-16 font-body">
      <div className="mx-auto max-w-xl rounded-[32px] border border-white bg-white/90 p-8 text-center shadow-deep">
        {state.phase === "loading" && (
          <div className="flex flex-col items-center gap-4 py-12 text-brand-navy/50">
            <Loader2 className="animate-spin" size={32} />
            <p className="text-xs font-black uppercase tracking-widest">
              Verifying your email…
            </p>
          </div>
        )}

        {state.phase === "ok" && (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-500">
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-brand-navy">
              Email verified
            </h1>
            <p className="mt-3 text-sm font-medium text-brand-navy/60">
              Your DockPulse account is all set. You can return to the
              dashboard.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-full bg-brand-blue px-6 py-3 text-xs font-black uppercase tracking-widest text-white"
            >
              Continue
            </Link>
          </>
        )}

        {state.phase === "error" && (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-500">
              <XCircle size={32} />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-brand-navy">
              Verification failed
            </h1>
            <p className="mt-3 text-sm font-medium text-brand-navy/60">
              {state.message}
            </p>
            <p className="mt-2 text-xs text-brand-navy/40">
              Tokens expire after 24 hours. Request a new email from the banner
              inside the app.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-full bg-brand-navy/10 px-6 py-3 text-xs font-black uppercase tracking-widest text-brand-navy"
            >
              Back to dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user || user.email_verified !== false || hidden) return null;

  async function resend() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email }),
      });
      if (res.ok) {
        toast.success("Verification email resent. Check your inbox.");
      } else {
        toast.error("Could not resend verification email.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed left-1/2 top-3 z-[180] -translate-x-1/2 w-[min(640px,calc(100%-1.5rem))]">
      <div className="flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/95 px-4 py-3 shadow-deep backdrop-blur-md">
        <AlertTriangle
          size={16}
          className="shrink-0 text-amber-600"
          strokeWidth={2.5}
        />
        <p className="flex-1 text-[11px] font-bold leading-snug text-amber-900">
          Your email isn't verified yet. Check your inbox for the verification
          link.
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Resend"}
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="shrink-0 rounded-full p-1.5 text-amber-700/60 transition-colors hover:bg-amber-500/10"
          aria-label="Dismiss banner"
        >
          <X size={14} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

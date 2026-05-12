import { Loader2, Mail, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { components } from "../api-types";
import { useBerthInvites } from "../hooks/useBerthInvites";
import { cn } from "../lib/utils";

type Berth = components["schemas"]["BerthOut"];

interface InviteOwnerModalProps {
  open: boolean;
  berth: Berth;
  harborId: string;
  onClose: () => void;
  onCreated?: () => void;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function InviteOwnerModal({
  open,
  berth,
  harborId,
  onClose,
  onCreated,
}: InviteOwnerModalProps) {
  const { createInvite } = useBerthInvites(harborId);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  function handleClose() {
    if (isSubmitting) return;

    setEmail("");
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isSubmitting) return;

    const trimmedEmail = email.trim().toLowerCase();

    if (!isValidEmail(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await createInvite(berth.berth_id, trimmedEmail);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success("Invite sent.");
      setEmail("");
      onCreated?.();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-brand-navy/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-white p-6 shadow-deep">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-brand-navy">
              Invite Owner
            </h2>

            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-brand-navy/40">
              Berth {berth.label || berth.berth_id}
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="grid h-10 w-10 place-items-center rounded-full bg-brand-navy/5 text-brand-navy/60 transition-colors hover:bg-brand-navy/10 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close invite modal"
          >
            <X size={16} strokeWidth={3} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset
            disabled={isSubmitting}
            className="m-0 space-y-4 border-0 p-0 disabled:opacity-60"
          >
            <div>
              <label
                htmlFor="invite-email"
                className="mb-2 block text-[10px] font-black uppercase tracking-widest text-brand-navy/50"
              >
                Invitee email
              </label>

              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-navy/30"
                />

                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="owner@example.com"
                  className="h-12 w-full rounded-2xl border border-black/5 bg-slate-50 pl-11 pr-4 text-sm font-bold text-brand-navy outline-none transition-all focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>
            </div>
          </fieldset>

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600">
              {error}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleClose}
              className="h-12 rounded-2xl border border-slate-200 px-4 text-[10px] font-black uppercase tracking-widest text-brand-navy/60 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-blue to-brand-cyan px-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-brand-blue/20 transition-all",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? "Sending..." : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

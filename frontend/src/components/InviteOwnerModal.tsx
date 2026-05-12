import { Loader2, Mail, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { components } from "../api-types";
import {
  createInvite,
  type HarborUser,
  searchHarborUsers,
} from "../hooks/useBerthInvites";
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
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [suggestions, setSuggestions] = useState<HarborUser[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // debounced lookup of users known to this harbor; aborts on each keystroke
  // so racing responses can't overwrite a fresher result
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    const trimmed = email.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsSuggesting(false);
      return;
    }
    setIsSuggesting(true);
    debounceRef.current = window.setTimeout(async () => {
      const rows = await searchHarborUsers(harborId, trimmed);
      // drop the suggestion if it's the only match and equals the typed email,
      // saves a "pick yourself" click
      const filtered = rows.filter(
        (u) => u.email.toLowerCase() !== trimmed.toLowerCase(),
      );
      setSuggestions(filtered);
      setIsSuggesting(false);
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [email, harborId, open]);

  if (!open) return null;

  function pickUser(user: HarborUser) {
    setEmail(user.email);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  function handleClose() {
    if (isSubmitting) return;

    setEmail("");
    setError(null);
    setSuggestions([]);
    setShowSuggestions(false);
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
      const result = await createInvite(harborId, berth.berth_id, trimmedEmail);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success("Invite sent.");
      setEmail("");
      setSuggestions([]);
      onCreated?.();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  const suggestionsVisible =
    showSuggestions && (suggestions.length > 0 || isSuggesting);

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-brand-navy/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-white p-7 shadow-deep sm:p-8">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-brand-navy">
              Invite Owner
            </h2>

            <p className="mt-1.5 text-xs font-bold uppercase tracking-widest text-brand-navy/40">
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset
            disabled={isSubmitting}
            className="m-0 space-y-6 border-0 p-0 disabled:opacity-60"
          >
            <div>
              <label
                htmlFor="invite-email"
                className="mb-3 block text-[10px] font-black uppercase tracking-widest text-brand-navy/50"
              >
                Invitee — search known users or type any email
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
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() =>
                    // delay so a click on a suggestion still registers
                    window.setTimeout(() => setShowSuggestions(false), 150)
                  }
                  placeholder="owner@example.com"
                  autoComplete="off"
                  className="h-14 w-full rounded-2xl border border-black/5 bg-slate-50 pl-12 pr-4 text-sm font-bold text-brand-navy outline-none transition-all focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                />

                {suggestionsVisible && (
                  <ul className="absolute left-0 right-0 top-full z-10 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-black/5 bg-white shadow-lg">
                    {isSuggesting && suggestions.length === 0 ? (
                      <li className="px-4 py-3 text-xs font-bold text-brand-navy/40">
                        Searching...
                      </li>
                    ) : (
                      suggestions.map((u) => (
                        <li key={u.user_id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickUser(u)}
                            className="block w-full px-4 py-3 text-left transition-colors hover:bg-brand-blue/5"
                          >
                            <p className="text-sm font-bold text-brand-navy">
                              {u.firstname} {u.lastname}
                            </p>
                            <p className="text-xs text-brand-navy/50">
                              {u.email}
                            </p>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
          </fieldset>

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600">
              {error}
            </p>
          )}

          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleClose}
              className="h-14 rounded-2xl border border-slate-200 px-4 text-[10px] font-black uppercase tracking-widest text-brand-navy/60 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className={cn(
                "flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-blue to-brand-cyan px-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-brand-blue/20 transition-all",
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

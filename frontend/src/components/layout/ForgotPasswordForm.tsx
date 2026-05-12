import { Loader2 } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "../../lib/api";
import { Button } from "../shared/ui/button";
import { Input } from "../shared/ui/input";
import { Label } from "../shared/ui/label";

const fieldInputClass =
  "bg-white/50 border-black/5 rounded-2xl h-12 px-4 font-bold text-sm focus:ring-2 focus:ring-brand-blue/20 transition-all";

const fieldLabelClass =
  "text-[10px] font-black uppercase tracking-widest text-brand-navy/60 ml-1";

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailReady = email.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isSubmitting || !emailReady) return;

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await apiFetch("/api/users/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        skipAuthRefresh: true,
      });

      if (!res.ok) {
        throw new Error("Reset request failed.");
      }

      setMessage("An email has been sent if an existing account exists.");
    } catch {
      setError("Could not send reset email. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <fieldset
        disabled={isSubmitting}
        className="space-y-4 border-0 p-0 m-0 disabled:opacity-60"
      >
        <div className="space-y-2">
          <Label htmlFor="forgot-password-email" className={fieldLabelClass}>
            Email
          </Label>

          <Input
            id="forgot-password-email"
            type="email"
            autoComplete="email"
            placeholder="name@marina.com"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
              setMessage(null);
            }}
            className={fieldInputClass}
          />
        </div>
      </fieldset>

      <p
        role="status"
        aria-live="polite"
        className="text-emerald-600 text-[10px] font-bold text-center min-h-[1.25rem]"
      >
        {message ?? ""}
      </p>

      <p
        role="alert"
        aria-live="assertive"
        className="text-red-500 text-[10px] font-bold text-center min-h-[1.25rem]"
      >
        {error ?? ""}
      </p>

      <Button
        type="submit"
        disabled={isSubmitting || !emailReady}
        aria-busy={isSubmitting}
        className="w-full h-12 bg-gradient-to-r from-brand-blue to-brand-cyan text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-blue/20 hover:shadow-xl hover:shadow-brand-blue/40 transition-all active:scale-[0.98]"
      >
        {isSubmitting && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {isSubmitting ? "Sending..." : "Send Reset Email"}
      </Button>

      <button
        type="button"
        onClick={onBackToLogin}
        className="w-full text-[10px] font-black uppercase tracking-widest text-brand-blue hover:text-brand-navy transition-colors"
      >
        Back to login
      </button>
    </form>
  );
}

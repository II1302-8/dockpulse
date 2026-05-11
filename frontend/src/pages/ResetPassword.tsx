import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../components/shared/ui/button";
import { Label } from "../components/shared/ui/label";
import { PasswordInput } from "../components/shared/ui/password-input";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/utils";

const PASSWORD_MIN = import.meta.env.MODE === "production" ? 12 : 4;
const PASSWORD_MAX = 128;

const fieldInputClass =
  "bg-white/50 border-black/5 rounded-2xl h-12 px-4 font-bold text-sm focus:ring-2 focus:ring-brand-blue/20 transition-all";

const fieldLabelClass =
  "text-[10px] font-black uppercase tracking-widest text-brand-navy/60 ml-1";

async function getErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = await res.json();

    if (typeof data.detail === "string") return data.detail;
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;

    return `${fallback} Status: ${res.status}`;
  } catch {
    return `${fallback} Status: ${res.status}`;
  }
}

export function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordLength = password.length;

  const passwordValid =
    passwordLength >= PASSWORD_MIN && passwordLength <= PASSWORD_MAX;

  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const formReady =
    Boolean(token) &&
    passwordValid &&
    confirmPassword.length > 0 &&
    !passwordMismatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isSubmitting || !formReady || !token) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await apiFetch("/api/users/resetpassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
        }),
        skipAuthRefresh: true,
      });

      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not reset password."),
        );
      }

      toast.success("Password reset successfully.");

      navigate("/saltsjobaden?login=1", {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset password.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh w-screen bg-gradient-to-br from-white to-slate-100 flex items-center justify-center px-4">
      <section className="w-full max-w-md rounded-[32px] border border-white/40 bg-white/90 p-6 sm:p-8 shadow-deep backdrop-blur-xl">
        <div className="mb-6 text-center space-y-2">
          <h1 className="text-2xl font-black text-brand-navy tracking-tight uppercase">
            Reset Password
          </h1>

          <p className="text-xs font-bold text-brand-navy/40 uppercase tracking-widest">
            Choose a new password
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset
            disabled={isSubmitting}
            className="space-y-4 border-0 p-0 m-0 disabled:opacity-60"
          >
            <div className="space-y-2">
              <Label htmlFor="new-password" className={fieldLabelClass}>
                New Password
              </Label>

              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className={fieldInputClass}
              />

              <p
                className={cn(
                  "text-[9px] font-bold uppercase tracking-widest ml-1",
                  passwordLength === 0
                    ? "text-brand-navy/30"
                    : passwordValid
                      ? "text-emerald-500"
                      : "text-red-500",
                )}
              >
                {passwordValid
                  ? `Looks good (${passwordLength} characters)`
                  : `Min ${PASSWORD_MIN} characters`}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-new-password" className={fieldLabelClass}>
                Confirm Password
              </Label>

              <PasswordInput
                id="confirm-new-password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                className={fieldInputClass}
              />

              <p className="text-red-500 text-[9px] font-bold uppercase tracking-widest ml-1 min-h-[1rem]">
                {passwordMismatch ? "Passwords do not match" : ""}
              </p>
            </div>
          </fieldset>

          <p
            role="alert"
            aria-live="assertive"
            className="text-red-500 text-[10px] font-bold text-center min-h-[1.25rem]"
          >
            {error ?? ""}
          </p>

          <Button
            type="submit"
            disabled={isSubmitting || !formReady}
            aria-busy={isSubmitting}
            className="w-full h-12 bg-gradient-to-r from-brand-blue to-brand-cyan text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-blue/20 hover:shadow-xl hover:shadow-brand-blue/40 transition-all active:scale-[0.98]"
          >
            {isSubmitting && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}

            {isSubmitting ? "Resetting..." : "Reset Password"}
          </Button>
        </form>

        <Link
          to="/saltsjobaden?login=1"
          className="mt-5 block text-center text-[10px] font-black uppercase tracking-widest text-brand-blue hover:text-brand-navy transition-colors"
        >
          Back to login
        </Link>
      </section>
    </main>
  );
}

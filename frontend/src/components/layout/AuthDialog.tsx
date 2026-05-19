import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { cn } from "../../lib/utils";
import { Button } from "../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../shared/ui/dialog";
import { Input } from "../shared/ui/input";
import { Label } from "../shared/ui/label";
import { PasswordInput } from "../shared/ui/password-input";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

type AuthTab = "login" | "signup" | "forgot";

type SignupForm = {
  email: string;
  password: string;
  confirmPassword: string;
  firstname: string;
  lastname: string;
};

const emptySignupForm: SignupForm = {
  email: "",
  password: "",
  confirmPassword: "",
  firstname: "",
  lastname: "",
};

const PASSWORD_MIN = import.meta.env.MODE === "production" ? 12 : 4;
const PASSWORD_MAX = 128;

const fieldInputClass =
  "bg-white/50 border-black/5 rounded-2xl h-12 px-4 font-bold text-sm focus:ring-2 focus:ring-brand-blue/20 transition-all";
const fieldLabelClass =
  "text-xs font-black uppercase tracking-widest text-brand-navy/60 ml-1";

async function getErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = await res.json();

    if (typeof data.detail === "string") return data.detail;
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;

    if (Array.isArray(data.detail)) {
      return data.detail
        .map((err: { loc?: unknown[]; msg?: string }) => {
          const field = Array.isArray(err.loc) ? err.loc.at(-1) : null;
          return field ? `${field}: ${err.msg}` : err.msg;
        })
        .join(", ");
    }

    return `${fallback} Status: ${res.status}`;
  } catch {
    return `${fallback} Status: ${res.status}`;
  }
}

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillEmail?: string;
  lockEmail?: boolean;
  defaultTab?: "login" | "signup";
}

export function AuthDialog({
  open,
  onOpenChange,
  prefillEmail,
  lockEmail = false,
  defaultTab = "login",
}: AuthDialogProps) {
  const { refresh } = useAuth();

  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupForm, setSignupForm] = useState<SignupForm>(emptySignupForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = authTab === "login";
  const isForgot = authTab === "forgot";

  const loginReady = loginEmail.trim().length > 0 && loginPassword.length > 0;

  const passwordLength = signupForm.password.length;
  const passwordTooShort = passwordLength > 0 && passwordLength < PASSWORD_MIN;
  const passwordValid =
    passwordLength >= PASSWORD_MIN && passwordLength <= PASSWORD_MAX;
  const passwordMismatch =
    signupForm.confirmPassword.length > 0 &&
    signupForm.password !== signupForm.confirmPassword;
  const signupReady =
    signupForm.email.trim().length > 0 &&
    signupForm.firstname.trim().length > 0 &&
    signupForm.lastname.trim().length > 0 &&
    passwordValid &&
    signupForm.confirmPassword.length > 0 &&
    !passwordMismatch;

  useEffect(() => {
    if (!open) return;

    setAuthTab(defaultTab);
    setError(null);

    if (prefillEmail) {
      setLoginEmail(prefillEmail);
      setSignupForm((prev) => ({
        ...prev,
        email: prefillEmail,
      }));
    }
  }, [open, prefillEmail, defaultTab]);

  function updateSignupField<K extends keyof SignupForm>(
    field: K,
    value: SignupForm[K],
  ) {
    setSignupForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function resetForms() {
    setLoginEmail("");
    setLoginPassword("");
    setSignupForm(emptySignupForm);
    setAuthTab("login");
    setError(null);
  }

  async function authenticate(email: string, password: string) {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      skipAuthRefresh: true,
    });

    if (!res.ok) {
      throw new Error(await getErrorMessage(res, "Wrong email or password."));
    }
  }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();

    if (isSubmitting || !loginReady) return;

    setError(null);
    setIsSubmitting(true);

    const email = loginEmail.trim();

    try {
      await authenticate(email, loginPassword);
      await refresh();
      onOpenChange(false);
      resetForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignup(e?: React.FormEvent) {
    e?.preventDefault();

    if (isSubmitting || !signupReady) return;

    setError(null);
    setIsSubmitting(true);

    const { confirmPassword: _confirmPassword, ...rest } = signupForm;
    const payload = {
      ...rest,
      email: rest.email.trim(),
      firstname: rest.firstname.trim(),
      lastname: rest.lastname.trim(),
    };

    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        skipAuthRefresh: true,
      });

      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not create account."),
        );
      }

      await authenticate(payload.email, signupForm.password);
      await refresh();
      onOpenChange(false);
      resetForms();
      toast.success(`Welcome, ${payload.firstname}!`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create account.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const lockedEmailClass =
    lockEmail && "cursor-not-allowed bg-slate-100 text-brand-navy/60";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);

        if (!next) {
          resetForms();
        }
      }}
    >
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto bg-white/90 backdrop-blur-xl border-white/40 rounded-[32px] p-5 sm:p-8 shadow-deep animate-in zoom-in-95 duration-300">
        <VisuallyHidden.Root>
          <DialogTitle>
            {isForgot ? "Reset password" : "Log in or sign up"}
          </DialogTitle>
          <DialogDescription>
            Authentication dialog to log in or create an account.
          </DialogDescription>
        </VisuallyHidden.Root>

        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-brand-navy tracking-tight uppercase">
              {isForgot
                ? "Reset Password"
                : isLogin
                  ? "Welcome Back"
                  : "Create Account"}
            </h2>

            <p className="text-xs font-bold text-brand-navy/40 uppercase tracking-widest">
              {isForgot
                ? "Enter your email to receive a reset link"
                : isLogin
                  ? "Enter your credentials to continue"
                  : "Join your marina community"}
            </p>
          </div>

          {!isForgot && (
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="flex p-1 bg-brand-navy/5 rounded-full"
            >
              {(["login", "signup"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={authTab === tab}
                  onClick={() => {
                    setAuthTab(tab);
                    setError(null);
                  }}
                  className={cn(
                    "flex-1 h-10 rounded-full text-xs font-black uppercase tracking-widest transition-all",
                    authTab === tab
                      ? "bg-white shadow-sm text-brand-navy"
                      : "text-brand-navy/40 hover:text-brand-navy/70",
                  )}
                >
                  {tab === "login" ? "Log In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          {isForgot ? (
            <ForgotPasswordForm
              onBackToLogin={() => {
                setAuthTab("login");
                setError(null);
              }}
            />
          ) : isLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <fieldset
                disabled={isSubmitting}
                className="space-y-4 border-0 p-0 m-0 disabled:opacity-60"
              >
                <div className="space-y-2">
                  <Label htmlFor="login-email" className={fieldLabelClass}>
                    Email
                  </Label>

                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    enterKeyHint="next"
                    placeholder="name@marina.com"
                    required
                    autoFocus={!lockEmail}
                    readOnly={lockEmail}
                    aria-readonly={lockEmail}
                    value={loginEmail}
                    onChange={(e) => {
                      if (lockEmail) return;
                      setLoginEmail(e.target.value);
                      setError(null);
                    }}
                    className={cn(fieldInputClass, lockedEmailClass)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className={fieldLabelClass}>
                    Password
                  </Label>

                  <PasswordInput
                    id="login-password"
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setError(null);
                    }}
                    className={fieldInputClass}
                  />
                </div>
              </fieldset>

              <button
                type="button"
                onClick={() => {
                  setAuthTab("forgot");
                  setError(null);
                }}
                className="block ml-auto text-xs font-black uppercase tracking-widest text-brand-blue hover:text-brand-navy transition-colors"
              >
                Forgot password?
              </button>

              <p
                role="alert"
                aria-live="assertive"
                className="text-red-500 text-xs font-bold text-center min-h-[1.25rem]"
              >
                {error ?? ""}
              </p>

              <Button
                type="submit"
                disabled={isSubmitting || !loginReady}
                aria-busy={isSubmitting}
                className="w-full h-12 bg-gradient-to-r from-brand-blue to-brand-cyan text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-brand-blue/20 hover:shadow-xl hover:shadow-brand-blue/40 transition-all active:scale-[0.98] mt-2"
              >
                {isSubmitting && (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {isSubmitting ? "Authenticating..." : "Sign In"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <fieldset
                disabled={isSubmitting}
                className="space-y-4 border-0 p-0 m-0 disabled:opacity-60"
              >
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className={fieldLabelClass}>
                    Email
                  </Label>

                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    enterKeyHint="next"
                    placeholder="name@marina.com"
                    required
                    autoFocus={!lockEmail}
                    readOnly={lockEmail}
                    aria-readonly={lockEmail}
                    value={signupForm.email}
                    onChange={(e) => {
                      if (lockEmail) return;
                      updateSignupField("email", e.target.value);
                    }}
                    className={cn(fieldInputClass, lockedEmailClass)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label
                      htmlFor="signup-firstname"
                      className={fieldLabelClass}
                    >
                      First Name
                    </Label>

                    <Input
                      id="signup-firstname"
                      autoComplete="given-name"
                      required
                      value={signupForm.firstname}
                      onChange={(e) =>
                        updateSignupField("firstname", e.target.value)
                      }
                      className={fieldInputClass}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="signup-lastname"
                      className={fieldLabelClass}
                    >
                      Last Name
                    </Label>

                    <Input
                      id="signup-lastname"
                      autoComplete="family-name"
                      required
                      value={signupForm.lastname}
                      onChange={(e) =>
                        updateSignupField("lastname", e.target.value)
                      }
                      className={fieldInputClass}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password" className={fieldLabelClass}>
                    Password
                  </Label>

                  <PasswordInput
                    id="signup-password"
                    autoComplete="new-password"
                    required
                    minLength={PASSWORD_MIN}
                    maxLength={PASSWORD_MAX}
                    aria-invalid={passwordTooShort}
                    aria-describedby="signup-password-hint"
                    value={signupForm.password}
                    onChange={(e) =>
                      updateSignupField("password", e.target.value)
                    }
                    className={fieldInputClass}
                  />

                  <p
                    id="signup-password-hint"
                    aria-live="polite"
                    className={cn(
                      "text-xs font-bold uppercase tracking-widest ml-1",
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
                  <Label
                    htmlFor="signup-confirm-password"
                    className={fieldLabelClass}
                  >
                    Confirm Password
                  </Label>

                  <PasswordInput
                    id="signup-confirm-password"
                    autoComplete="new-password"
                    required
                    aria-invalid={passwordMismatch}
                    aria-describedby="signup-confirm-hint"
                    value={signupForm.confirmPassword}
                    onChange={(e) =>
                      updateSignupField("confirmPassword", e.target.value)
                    }
                    className={fieldInputClass}
                  />

                  <p
                    id="signup-confirm-hint"
                    aria-live="polite"
                    className="text-red-500 text-xs font-bold uppercase tracking-widest ml-1 min-h-[1rem]"
                  >
                    {passwordMismatch ? "Passwords do not match" : ""}
                  </p>
                </div>
              </fieldset>

              <p
                role="alert"
                aria-live="assertive"
                className="text-red-500 text-xs font-bold text-center min-h-[1.25rem]"
              >
                {error ?? ""}
              </p>

              <Button
                type="submit"
                disabled={isSubmitting || !signupReady}
                aria-busy={isSubmitting}
                className="w-full h-12 bg-gradient-to-r from-brand-blue to-brand-cyan text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-brand-blue/20 hover:shadow-xl hover:shadow-brand-blue/40 transition-all active:scale-[0.98] mt-2"
              >
                {isSubmitting && (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {isSubmitting ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

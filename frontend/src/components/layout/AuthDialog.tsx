import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { Button } from "../shared/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../shared/ui/dialog";
import { Input } from "../shared/ui/input";
import { Label } from "../shared/ui/label";
import { PasswordInput } from "../shared/ui/password-input";
import type { AuthUser } from "./MainLayout";

type AuthTab = "login" | "signup";

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

// mirror backend APP_ENV: prod build enforces the 12 char floor, dev/staging relaxed for testing
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
  onAuthSuccess: (accessToken: string, optimisticUser: AuthUser) => void;
}

export function AuthDialog({
  open,
  onOpenChange,
  onAuthSuccess,
}: AuthDialogProps) {
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupForm, setSignupForm] = useState<SignupForm>(emptySignupForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = authTab === "login";
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
    const tokenRes = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!tokenRes.ok) {
      throw new Error(
        await getErrorMessage(tokenRes, "Wrong email or password."),
      );
    }

    const { access_token: accessToken } = await tokenRes.json();
    if (!accessToken) {
      throw new Error("Login succeeded, but no access token was returned.");
    }
    return accessToken as string;
  }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    if (isSubmitting || !loginReady) return;
    setError(null);
    setIsSubmitting(true);

    const email = loginEmail.trim();

    try {
      const accessToken = await authenticate(email, loginPassword);
      onAuthSuccess(accessToken, { email });
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not create account."),
        );
      }

      // server accepted creds → reuse them to drop user into a logged-in state
      const accessToken = await authenticate(
        payload.email,
        signupForm.password,
      );
      onAuthSuccess(accessToken, {
        email: payload.email,
        firstname: payload.firstname,
        lastname: payload.lastname,
      });
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForms();
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-white/90 backdrop-blur-xl border-white/40 rounded-[32px] p-8 shadow-deep animate-in zoom-in-95 duration-300">
        <VisuallyHidden.Root>
          <DialogTitle>Log in or sign up</DialogTitle>
        </VisuallyHidden.Root>
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-brand-navy tracking-tight uppercase">
              {isLogin ? "Welcome Back" : "Create Account"}
            </h2>
            <p className="text-xs font-bold text-brand-navy/40 uppercase tracking-widest">
              {isLogin
                ? "Enter your credentials to continue"
                : "Join your marina community"}
            </p>
          </div>

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
                  "flex-1 h-10 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                  authTab === tab
                    ? "bg-white shadow-sm text-brand-navy"
                    : "text-brand-navy/40 hover:text-brand-navy/70",
                )}
              >
                {tab === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          {isLogin ? (
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
                    placeholder="name@marina.com"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className={fieldInputClass}
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
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className={fieldInputClass}
                  />
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
                disabled={isSubmitting || !loginReady}
                aria-busy={isSubmitting}
                className="w-full h-12 bg-gradient-to-r from-brand-blue to-brand-cyan text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-blue/20 hover:shadow-xl hover:shadow-brand-blue/40 transition-all active:scale-[0.98] mt-2"
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
                    placeholder="name@marina.com"
                    required
                    value={signupForm.email}
                    onChange={(e) => updateSignupField("email", e.target.value)}
                    className={fieldInputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                    className="text-red-500 text-[9px] font-bold uppercase tracking-widest ml-1 min-h-[1rem]"
                  >
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
                disabled={isSubmitting || !signupReady}
                aria-busy={isSubmitting}
                className="w-full h-12 bg-gradient-to-r from-brand-blue to-brand-cyan text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-blue/20 hover:shadow-xl hover:shadow-brand-blue/40 transition-all active:scale-[0.98] mt-2"
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

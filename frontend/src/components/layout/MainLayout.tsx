import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { Button } from "../shared/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../shared/ui/dialog";
import { Input } from "../shared/ui/input";
import { Label } from "../shared/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../shared/ui/tabs";
import { Footer } from "./Footer";
import { Header } from "./Header";

export type AuthUser = {
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  boat_club?: string;
};

export type AuthOutletContext = {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  token: string | null;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  isLoginOpen: boolean;
  setIsLoginOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

type AuthTab = "login" | "signup";

type LoginForm = {
  email: string;
  password: string;
};

type SignupForm = LoginForm & {
  confirmPassword: string;
  firstname: string;
  lastname: string;
  phone: string;
  boat_club: string;
};

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const emptyLoginForm: LoginForm = {
  email: "",
  password: "",
};

const emptySignupForm: SignupForm = {
  email: "",
  password: "",
  confirmPassword: "",
  firstname: "",
  lastname: "",
  phone: "",
  boat_club: "",
};

function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-red-500">
      *
    </span>
  );
}

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

function MainLayout() {
  const navigate = useNavigate();

  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  // localStorage simpler than httpOnly cookies but XSS-readable; revisit
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token"),
  );

  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [loginForm, setLoginForm] = useState<LoginForm>(emptyLoginForm);
  const [signupForm, setSignupForm] = useState<SignupForm>(emptySignupForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordLength = signupForm.password.length;
  const passwordTooShort = passwordLength > 0 && passwordLength < PASSWORD_MIN;
  const passwordValid =
    passwordLength >= PASSWORD_MIN && passwordLength <= PASSWORD_MAX;

  // live mismatch surfaces under confirm field while typing, not at bottom on submit
  const passwordMismatch =
    signupForm.confirmPassword.length > 0 &&
    signupForm.password !== signupForm.confirmPassword;

  const loginReady =
    loginForm.email.trim().length > 0 && loginForm.password.length > 0;

  const signupReady =
    signupForm.email.trim().length > 0 &&
    signupForm.firstname.trim().length > 0 &&
    signupForm.lastname.trim().length > 0 &&
    passwordValid &&
    signupForm.confirmPassword.length > 0 &&
    !passwordMismatch;

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    // abort stale /me requests if token changes again before this resolves
    const ac = new AbortController();

    fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    })
      .then((res) => {
        // only 401 clears session, transient errors leave token alone
        if (res.status === 401) {
          localStorage.removeItem("token");
          setToken(null);
          setUser(null);
          setActiveTab("login");
          setIsLoginOpen(true);
          navigate("/", { replace: true });
          return null;
        }
        if (!res.ok) throw new Error(`/me ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data) setUser(data);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("failed to load user", err);
      });

    return () => ac.abort();
  }, [token, navigate]);

  function updateLoginForm(field: keyof LoginForm, value: string) {
    setLoginForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function updateSignupForm(field: keyof SignupForm, value: string) {
    setSignupForm((prev) => ({ ...prev, [field]: value }));
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

    localStorage.setItem("token", accessToken);
    setToken(accessToken);
  }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    if (isSubmitting || !loginReady) return;
    setError(null);
    setIsSubmitting(true);

    const email = loginForm.email.trim();

    try {
      await authenticate(email, loginForm.password);
      // optimistic fill so avatar isn't blank during /me round-trip
      setUser((prev) => prev ?? { email });
      setIsLoginOpen(false);
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

    const signupPayload = {
      ...rest,
      email: rest.email.trim(),
      firstname: rest.firstname.trim(),
      lastname: rest.lastname.trim(),
      phone: rest.phone.trim() || null,
      boat_club: rest.boat_club.trim() || null,
    };

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signupPayload),
      });

      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not create account."),
        );
      }

      // server accepted creds → reuse them to drop user into a logged-in state
      await authenticate(signupPayload.email, signupForm.password);
      setUser(
        (prev) =>
          prev ?? {
            email: signupPayload.email,
            firstname: signupPayload.firstname,
            lastname: signupPayload.lastname,
          },
      );
      setIsLoginOpen(false);
      toast.success(`Welcome, ${signupPayload.firstname}!`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create account.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    const logoutToken = token;

    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setIsLoginOpen(false);
    navigate("/", { replace: true });

    if (!logoutToken) return;

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${logoutToken}`,
        },
      });
    } catch {
      // local state already cleared. server token left to expire naturally
    }
  }

  const userInitials =
    user?.firstname && user?.lastname
      ? `${user.firstname[0]}${user.lastname[0]}`
      : user?.email?.slice(0, 2).toUpperCase();

  return (
    <div className="bg-transparent duration-1000 font-body min-h-screen overflow-x-hidden relative transition-colors w-screen">
      <Header
        isLoggedIn={Boolean(user)}
        userInitials={userInitials}
        onLoginClickCB={() => setIsLoginOpen(true)}
        onLogoutClickCB={handleLogout}
      />

      <main className="absolute inset-0 z-0">
        <Outlet
          context={
            {
              user,
              setUser,
              token,
              setToken,
              isLoginOpen,
              setIsLoginOpen,
            } satisfies AuthOutletContext
          }
        />
      </main>

      <Dialog
        open={isLoginOpen}
        onOpenChange={(open) => {
          setIsLoginOpen(open);

          if (!open) {
            setLoginForm(emptyLoginForm);
            setSignupForm(emptySignupForm);
            setActiveTab("login");
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <VisuallyHidden.Root>
            <DialogTitle>Log in or sign up</DialogTitle>
          </VisuallyHidden.Root>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value as AuthTab);
              setError(null);
            }}
            className="mt-4"
          >
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">
                    Email
                    <RequiredMark />
                  </Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={loginForm.email}
                    onChange={(e) => updateLoginForm("email", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">
                    Password
                    <RequiredMark />
                  </Label>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={loginForm.password}
                    onChange={(e) =>
                      updateLoginForm("password", e.target.value)
                    }
                  />
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <Button
                  type="submit"
                  disabled={isSubmitting || !loginReady}
                  className="w-full bg-brand-blue hover:bg-brand-blue/90"
                >
                  {isSubmitting ? "Logging in…" : "Log in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">
                    Email
                    <RequiredMark />
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={signupForm.email}
                    onChange={(e) => updateSignupForm("email", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">
                    Password
                    <RequiredMark />
                  </Label>
                  <Input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={PASSWORD_MIN}
                    maxLength={PASSWORD_MAX}
                    aria-invalid={passwordTooShort}
                    aria-describedby="signup-password-hint"
                    value={signupForm.password}
                    onChange={(e) =>
                      updateSignupForm("password", e.target.value)
                    }
                  />
                  <p
                    id="signup-password-hint"
                    className={`text-sm ${
                      passwordLength === 0
                        ? "text-muted-foreground"
                        : passwordValid
                          ? "text-emerald-600"
                          : "text-red-500"
                    }`}
                  >
                    {passwordValid
                      ? `Looks good (${passwordLength} characters).`
                      : `Must be at least ${PASSWORD_MIN} characters.`}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">
                    Confirm password
                    <RequiredMark />
                  </Label>
                  <Input
                    id="signup-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    aria-invalid={passwordMismatch}
                    value={signupForm.confirmPassword}
                    onChange={(e) =>
                      updateSignupForm("confirmPassword", e.target.value)
                    }
                  />
                  {passwordMismatch && (
                    <p className="text-red-500 text-sm">
                      Passwords do not match.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-firstname">
                    First name
                    <RequiredMark />
                  </Label>
                  <Input
                    id="signup-firstname"
                    autoComplete="given-name"
                    required
                    value={signupForm.firstname}
                    onChange={(e) =>
                      updateSignupForm("firstname", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-lastname">
                    Last name
                    <RequiredMark />
                  </Label>
                  <Input
                    id="signup-lastname"
                    autoComplete="family-name"
                    required
                    value={signupForm.lastname}
                    onChange={(e) =>
                      updateSignupForm("lastname", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-phone">Phone</Label>
                  <Input
                    id="signup-phone"
                    type="tel"
                    autoComplete="tel"
                    value={signupForm.phone}
                    onChange={(e) => updateSignupForm("phone", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-boat-club">Boat club</Label>
                  <Input
                    id="signup-boat-club"
                    value={signupForm.boat_club}
                    onChange={(e) =>
                      updateSignupForm("boat_club", e.target.value)
                    }
                  />
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <Button
                  type="submit"
                  disabled={isSubmitting || !signupReady}
                  className="w-full bg-brand-navy hover:bg-brand-navy/90"
                >
                  {isSubmitting ? "Creating account…" : "Sign up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Footer />

      <Toaster position="top-center" richColors />
    </div>
  );
}

export { MainLayout };

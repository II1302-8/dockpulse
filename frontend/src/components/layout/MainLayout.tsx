import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "../shared/ui/dialog";
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

const inputClass = "w-full border p-2 rounded";

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
        .map((err) => {
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
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  // TODO: Move token storage to httpOnly cookies (XSS-safe)
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token"),
  );

  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [loginForm, setLoginForm] = useState<LoginForm>(emptyLoginForm);
  const [signupForm, setSignupForm] = useState<SignupForm>(emptySignupForm);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    fetch("/api/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        // only 401 clears session, transient errors leave token alone
        if (res.status === 401) {
          setUser(null);
          setToken(null);
          localStorage.removeItem("token");
          return null;
        }
        if (!res.ok) throw new Error(`/me ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data) setUser(data);
      })
      .catch((err) => console.error("failed to load user", err));
  }, [token]);

  function clearMessages() {
    setError(null);
    setSuccessMessage(null);
  }

  function updateLoginForm(field: keyof LoginForm, value: string) {
    setLoginForm((prev) => ({ ...prev, [field]: value }));
    clearMessages();
  }

  function updateSignupForm(field: keyof SignupForm, value: string) {
    setSignupForm((prev) => ({ ...prev, [field]: value }));
    clearMessages();
  }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    clearMessages();

    try {
      const tokenRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
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
      setIsLoginOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in.");
    }
  }

  async function handleSignup(e?: React.FormEvent) {
    e?.preventDefault();
    clearMessages();

    if (signupForm.password !== signupForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

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

      setLoginForm({
        email: signupForm.email,
        password: signupForm.password,
      });

      setActiveTab("login");
      setSuccessMessage("Account created. You can now log in.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create account.",
      );
    }
  }

  const userInitials =
    user?.firstname && user?.lastname
      ? `${user.firstname[0]}${user.lastname[0]}`
      : user?.email?.slice(0, 2).toUpperCase();

  return (
    <div className="bg-transparent duration-1000 font-body h-screen overflow-hidden relative transition-colors w-screen">
      <Header
        isLoggedIn={Boolean(token)}
        userInitials={userInitials}
        onLoginClickCB={() => setIsLoginOpen(true)}
      />

      <main className="absolute inset-0 z-0">
        <Outlet />
      </main>

      <Dialog
        open={isLoginOpen}
        onOpenChange={(open) => {
          setIsLoginOpen(open);
          // reset form state on close so reopen starts fresh
          if (!open) {
            setLoginForm(emptyLoginForm);
            setSignupForm(emptySignupForm);
            setActiveTab("login");
            clearMessages();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <VisuallyHidden.Root>
            <DialogTitle>Log in or sign up</DialogTitle>
          </VisuallyHidden.Root>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value as AuthTab);
              clearMessages();
            }}
            className="mt-4"
          >
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <input
                  className={inputClass}
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={loginForm.email}
                  onChange={(e) => updateLoginForm("email", e.target.value)}
                />

                <input
                  className={inputClass}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  value={loginForm.password}
                  onChange={(e) => updateLoginForm("password", e.target.value)}
                />

                {error && <p className="text-red-500 text-sm">{error}</p>}
                {successMessage && (
                  <p className="text-green-600 text-sm">{successMessage}</p>
                )}

                <button
                  type="submit"
                  className="w-full bg-brand-blue text-white p-2 rounded"
                >
                  Log in
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <form onSubmit={handleSignup} className="space-y-4">
                <input
                  className={inputClass}
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={signupForm.email}
                  onChange={(e) => updateSignupForm("email", e.target.value)}
                />

                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Password"
                  value={signupForm.password}
                  onChange={(e) => updateSignupForm("password", e.target.value)}
                />

                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  value={signupForm.confirmPassword}
                  onChange={(e) =>
                    updateSignupForm("confirmPassword", e.target.value)
                  }
                />

                <input
                  className={inputClass}
                  autoComplete="given-name"
                  placeholder="First name"
                  value={signupForm.firstname}
                  onChange={(e) =>
                    updateSignupForm("firstname", e.target.value)
                  }
                />

                <input
                  className={inputClass}
                  autoComplete="family-name"
                  placeholder="Last name"
                  value={signupForm.lastname}
                  onChange={(e) =>
                    updateSignupForm("lastname", e.target.value)
                  }
                />

                <input
                  className={inputClass}
                  type="tel"
                  autoComplete="tel"
                  placeholder="Phone (optional)"
                  value={signupForm.phone}
                  onChange={(e) => updateSignupForm("phone", e.target.value)}
                />

                <input
                  className={inputClass}
                  placeholder="Boat club (optional)"
                  value={signupForm.boat_club}
                  onChange={(e) =>
                    updateSignupForm("boat_club", e.target.value)
                  }
                />

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <button
                  type="submit"
                  className="w-full bg-brand-navy text-white p-2 rounded"
                >
                  Sign up
                </button>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

export { MainLayout };

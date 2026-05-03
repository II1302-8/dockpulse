import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import type { AuthUser } from "../components/layout/MainLayout";
import { Dialog, DialogContent } from "../components/shared/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/shared/ui/tabs";
import { HarborMap } from "../HarborMap";
import { getMarinaNameCB } from "../lib/marinas";

type DashboardOutletContext = {
  isLoginOpen: boolean;
  setIsLoginOpen: React.Dispatch<React.SetStateAction<boolean>>;
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  token: string | null;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
};

type AuthTab = "login" | "signup";

type LoginForm = {
  email: string;
  password: string;
};

type SignupForm = LoginForm & {
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

function Dashboard() {
  const { marinaSlug } = useParams();
  const marinaName = getMarinaNameCB(marinaSlug);

  const { isLoginOpen, setIsLoginOpen, setUser, setToken } =
    useOutletContext<DashboardOutletContext>();

  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [loginForm, setLoginForm] = useState<LoginForm>(emptyLoginForm);
  const [signupForm, setSignupForm] = useState<SignupForm>(emptySignupForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${marinaName} - Dashboard | DockPulse`;
  }, [marinaName]);

  function updateLoginForm(field: keyof LoginForm, value: string) {
    setLoginForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateSignupForm(field: keyof SignupForm, value: string) {
    setSignupForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleLogin() {
    setError(null);

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

      const userRes = await fetch("/api/users/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!userRes.ok) {
        throw new Error(
          await getErrorMessage(userRes, "Could not load user profile."),
        );
      }

      const userData = await userRes.json();

      localStorage.setItem("token", accessToken);
      setToken(accessToken);
      setUser(userData);
      setIsLoginOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in.");
    }
  }

  async function handleSignup() {
    setError(null);

    const signupPayload = {
      ...signupForm,
      email: signupForm.email.trim(),
      firstname: signupForm.firstname.trim(),
      lastname: signupForm.lastname.trim(),
      phone: signupForm.phone.trim() || null,
      boat_club: signupForm.boat_club.trim() || null,
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
      setError("Account created. You can now log in.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create account.",
      );
    }
  }

  return (
    <div className="animate-in duration-1000 fade-in h-full w-full">
      <HarborMap />

      <Dialog open={isLoginOpen} onOpenChange={setIsLoginOpen}>
        <DialogContent className="max-w-md">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value as AuthTab);
              setError(null);
            }}
          >
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4 mt-4">
              <input
                className={inputClass}
                placeholder="Email"
                value={loginForm.email}
                onChange={(e) => updateLoginForm("email", e.target.value)}
              />

              <input
                className={inputClass}
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(e) => updateLoginForm("password", e.target.value)}
              />

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                type="button"
                onClick={handleLogin}
                className="w-full bg-[#0093E9] text-white p-2 rounded"
              >
                Log in
              </button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4 mt-4">
              <input
                className={inputClass}
                placeholder="Email"
                value={signupForm.email}
                onChange={(e) => updateSignupForm("email", e.target.value)}
              />

              <input
                className={inputClass}
                type="password"
                placeholder="Password"
                value={signupForm.password}
                onChange={(e) => updateSignupForm("password", e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="First name"
                value={signupForm.firstname}
                onChange={(e) => updateSignupForm("firstname", e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="Last name"
                value={signupForm.lastname}
                onChange={(e) => updateSignupForm("lastname", e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="Phone (optional)"
                value={signupForm.phone}
                onChange={(e) => updateSignupForm("phone", e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="Boat club"
                value={signupForm.boat_club}
                onChange={(e) => updateSignupForm("boat_club", e.target.value)}
              />

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                type="button"
                onClick={handleSignup}
                className="w-full bg-[#0A2540] text-white p-2 rounded"
              >
                Sign up
              </button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { Dashboard };

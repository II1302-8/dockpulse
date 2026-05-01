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

function Dashboard() {
  const { marinaSlug } = useParams();
  const marinaName = getMarinaNameCB(marinaSlug);

  const { isLoginOpen, setIsLoginOpen, setUser, setToken } =
    useOutletContext<DashboardOutletContext>();

  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const [signupForm, setSignupForm] = useState({
    email: "",
    password: "",
    firstname: "",
    lastname: "",
    phone: "",
    boat_club: "",
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${marinaName} - Dashboard | DockPulse`;
  }, [marinaName]);

  async function handleLogin() {
    setError(null);

    try {
      const tokenRes = await fetch("/api/users/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });

      if (!tokenRes.ok) {
        throw new Error("Wrong email or password.");
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      const userRes = await fetch("/api/users/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!userRes.ok) {
        throw new Error("Could not load user profile.");
      }

      const userData = await userRes.json();

      localStorage.setItem("token", accessToken);
      setToken(accessToken);
      setUser(userData);
      setIsLoginOpen(false);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleSignup() {
    setError(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signupForm),
      });

      if (!res.ok) {
        let message = "Could not create account.";

        try {
          const errorData = await res.json();

          if (typeof errorData.detail === "string") {
            message = errorData.detail;
          } else if (Array.isArray(errorData.detail)) {
            message = errorData.detail.map((err: any) => err.msg).join(", ");
          }
        } catch {
          // Keep default message
        }

        throw new Error(message);
      }

      setLoginForm({
        email: signupForm.email,
        password: signupForm.password,
      });

      setActiveTab("login");
      setError(null);
    } catch (err: any) {
      setError(err.message);
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
              setActiveTab(value as "login" | "signup");
              setError(null);
            }}
          >
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4 mt-4">
              <input
                placeholder="Email"
                className="w-full border p-2 rounded"
                value={loginForm.email}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, email: e.target.value })
                }
              />

              <input
                type="password"
                placeholder="Password"
                className="w-full border p-2 rounded"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
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
                placeholder="Email"
                className="w-full border p-2 rounded"
                value={signupForm.email}
                onChange={(e) =>
                  setSignupForm({ ...signupForm, email: e.target.value })
                }
              />

              <input
                type="password"
                placeholder="Password"
                className="w-full border p-2 rounded"
                value={signupForm.password}
                onChange={(e) =>
                  setSignupForm({ ...signupForm, password: e.target.value })
                }
              />

              <input
                placeholder="First name"
                className="w-full border p-2 rounded"
                value={signupForm.firstname}
                onChange={(e) =>
                  setSignupForm({
                    ...signupForm,
                    firstname: e.target.value,
                  })
                }
              />

              <input
                placeholder="Last name"
                className="w-full border p-2 rounded"
                value={signupForm.lastname}
                onChange={(e) =>
                  setSignupForm({
                    ...signupForm,
                    lastname: e.target.value,
                  })
                }
              />

              <input
                placeholder="Phone (optional)"
                className="w-full border p-2 rounded"
                value={signupForm.phone}
                onChange={(e) =>
                  setSignupForm({ ...signupForm, phone: e.target.value })
                }
              />

              <input
                placeholder="Boat club"
                className="w-full border p-2 rounded"
                value={signupForm.boat_club}
                onChange={(e) =>
                  setSignupForm({
                    ...signupForm,
                    boat_club: e.target.value,
                  })
                }
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

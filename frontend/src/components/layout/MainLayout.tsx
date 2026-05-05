import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { cn } from "../../lib/utils";
import { AuthDialog } from "./AuthDialog";
import {
  DashboardLayoutProvider,
  useDashboardLayout,
} from "./DashboardLayoutContext";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { SideMenu } from "./SideMenu";

export type AuthUser = {
  user_id?: string;
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  boat_club?: string;
  role?: string;
};

export type AuthOutletContext = {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  token: string | null;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  isLoginOpen: boolean;
  setIsLoginOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

interface MainLayoutContentProps {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  token: string | null;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  isLoginOpen: boolean;
  setIsLoginOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function MainLayoutContent({
  user,
  setUser,
  token,
  setToken,
  isLoginOpen,
  setIsLoginOpen,
}: MainLayoutContentProps) {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const {
    isMenuExpanded,
    setIsMenuExpanded,
    isOverviewOpen,
    isActivityLogOpen,
    toggleOverview,
    toggleActivityLog,
    isDesktop,
  } = useDashboardLayout();

  const isHarborMaster = user?.role === "harbormaster";

  function handleAuthSuccess(accessToken: string, optimisticUser: AuthUser) {
    localStorage.setItem("token", accessToken);
    setToken(accessToken);
    // optimistic fill so avatar isn't blank during /me round-trip
    setUser((prev) => prev ?? optimisticUser);
    setIsLoginOpen(false);
  }

  async function handleLogout() {
    if (isLoggingOut) return;

    const logoutToken = token;

    setIsLoggingOut(true);
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setIsLoginOpen(false);
    navigate("/", { replace: true });

    if (!logoutToken) {
      setIsLoggingOut(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${logoutToken}` },
      });
      // local session already gone, but warn user the server still holds the token
      if (!res.ok) {
        toast.warning(
          "Logged out locally, but the server didn't confirm. Token will expire on its own.",
        );
      }
    } catch {
      toast.warning(
        "Logged out locally, but couldn't reach the server. Token will expire on its own.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  const userInitials =
    user?.firstname && user?.lastname
      ? `${user.firstname[0]}${user.lastname[0]}`
      : user?.email?.slice(0, 2).toUpperCase();

  return (
    <div className="bg-transparent duration-1000 font-body min-h-screen overflow-x-hidden relative transition-colors w-screen">
      <Header
        isLoggedIn={Boolean(token)}
        isLoggingOut={isLoggingOut}
        userInitials={userInitials}
        onLoginClickCB={() => setIsLoginOpen(true)}
        onLogoutClickCB={handleLogout}
      />

      {isHarborMaster && (
        <SideMenu
          isExpanded={isMenuExpanded}
          onToggle={() => setIsMenuExpanded(!isMenuExpanded)}
          isOverviewActive={isOverviewOpen}
          isActivityLogActive={isActivityLogOpen}
          onOverviewToggle={toggleOverview}
          onActivityLogToggle={toggleActivityLog}
        />
      )}

      <main
        className={cn(
          "absolute inset-0 z-[var(--z-map)] transition-all duration-500 pointer-events-auto",
          isHarborMaster && "lg:pl-20",
        )}
      >
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

      <AuthDialog
        open={isLoginOpen}
        onOpenChange={setIsLoginOpen}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* mobile harbormaster has bottom dock, footer would clash */}
      {!isDesktop && isHarborMaster ? null : <Footer />}

      <Toaster position="top-center" richColors />
    </div>
  );
}

function MainLayout() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  // localStorage simpler than httpOnly cookies but XSS-readable; revisit
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token"),
  );

  const navigate = useNavigate();

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

  return (
    <DashboardLayoutProvider userRole={user?.role}>
      <MainLayoutContent
        user={user}
        setUser={setUser}
        token={token}
        setToken={setToken}
        isLoginOpen={isLoginOpen}
        setIsLoginOpen={setIsLoginOpen}
      />
    </DashboardLayoutProvider>
  );
}

export { MainLayout };

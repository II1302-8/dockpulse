import { useEffect, useState } from "react";
import { Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { Toaster } from "sonner";
import { type AuthUser, useAuth } from "../../lib/auth-context";
import { cn } from "../../lib/utils";
import { AuthDialog } from "./AuthDialog";
import {
  DashboardLayoutProvider,
  useDashboardLayout,
} from "./DashboardLayoutContext";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { SideMenu } from "./SideMenu";

export type { AuthUser } from "../../lib/auth-context";

export type AuthOutletContext = {
  user: AuthUser | null;
  isLoginOpen: boolean;
  setIsLoginOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

interface MainLayoutContentProps {
  isLoginOpen: boolean;
  setIsLoginOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function MainLayoutContent({
  isLoginOpen,
  setIsLoginOpen,
}: MainLayoutContentProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
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

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      setIsLoginOpen(false);
      navigate("/", { replace: true });
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
        isLoggedIn={Boolean(user)}
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
              isLoginOpen,
              setIsLoginOpen,
            } satisfies AuthOutletContext
          }
        />
      </main>

      <AuthDialog open={isLoginOpen} onOpenChange={setIsLoginOpen} />

      {/* mobile harbormaster has bottom dock, footer would clash */}
      {!isDesktop && isHarborMaster ? null : <Footer />}

      <Toaster position="top-center" richColors />
    </div>
  );
}

function MainLayout() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // route guard redirect lands here with ?login=1, open the dialog and consume the flag
  useEffect(() => {
    if (searchParams.get("login") === "1") {
      setIsLoginOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("login");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <DashboardLayoutProvider userRole={user?.role}>
      <MainLayoutContent
        isLoginOpen={isLoginOpen}
        setIsLoginOpen={setIsLoginOpen}
      />
    </DashboardLayoutProvider>
  );
}

export { MainLayout };

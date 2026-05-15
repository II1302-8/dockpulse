import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLocation } from "react-router-dom";

interface DashboardLayoutContextType {
  // Panel States
  isOverviewOpen: boolean;
  setIsOverviewOpen: (open: boolean) => void;
  isActivityLogOpen: boolean;
  setIsActivityLogOpen: (open: boolean) => void;
  isNodeHealthOpen: boolean;
  setIsNodeHealthOpen: (open: boolean) => void;
  isBookingsOpen: boolean;
  setIsBookingsOpen: (open: boolean) => void;

  // Sidebar States
  isMenuExpanded: boolean;
  setIsMenuExpanded: (expanded: boolean) => void;

  // Layout Helpers
  sidebarOffset: number;
  isDesktop: boolean;

  // Actions
  toggleOverview: () => void;
  toggleActivityLog: () => void;
  toggleNodeHealth: () => void;
  toggleBookings: () => void;
  closeAllPanels: () => void;
}

const DashboardLayoutContext = createContext<
  DashboardLayoutContextType | undefined
>(undefined);

export function DashboardLayoutProvider({
  children,
  userRole,
}: {
  children: ReactNode;
  userRole?: string;
}) {
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isNodeHealthOpen, setIsNodeHealthOpen] = useState(false);
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );

  const location = useLocation();

  // Handle Responsive
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isDesktop = windowWidth >= 1024;

  // close panels only when LEAVING the dashboard (going to /settings etc).
  // arriving on the dashboard preserves panel state set by the sidebar so
  // clicking a panel from /settings actually opens it after navigation
  useEffect(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    // dashboard route is /:marinaSlug (single segment); longer paths are
    // sub-pages (settings, activity-log, etc) where panels don't render
    if (segments.length <= 1) return;
    setIsOverviewOpen(false);
    setIsActivityLogOpen(false);
    setIsNodeHealthOpen(false);
    setIsBookingsOpen(false);
  }, [location.pathname]);

  // Calculate Offset
  const sidebarOffset =
    userRole === "harbormaster"
      ? isDesktop
        ? isMenuExpanded
          ? 288
          : 112
        : 16
      : 16;

  // Actions
  const toggleOverview = () => {
    setIsOverviewOpen(!isOverviewOpen);
    setIsActivityLogOpen(false);
    setIsNodeHealthOpen(false);
    setIsBookingsOpen(false);
  };

  const toggleActivityLog = () => {
    setIsActivityLogOpen(!isActivityLogOpen);
    setIsOverviewOpen(false);
    setIsNodeHealthOpen(false);
    setIsBookingsOpen(false);
  };

  const toggleNodeHealth = () => {
    setIsNodeHealthOpen(!isNodeHealthOpen);
    setIsOverviewOpen(false);
    setIsActivityLogOpen(false);
    setIsBookingsOpen(false);
  };

  const toggleBookings = () => {
    setIsBookingsOpen(!isBookingsOpen);
    setIsOverviewOpen(false);
    setIsActivityLogOpen(false);
    setIsNodeHealthOpen(false);
  };

  const closeAllPanels = () => {
    setIsOverviewOpen(false);
    setIsActivityLogOpen(false);
    setIsNodeHealthOpen(false);
    setIsBookingsOpen(false);
  };

  return (
    <DashboardLayoutContext.Provider
      value={{
        isOverviewOpen,
        setIsOverviewOpen,
        isActivityLogOpen,
        setIsActivityLogOpen,
        isNodeHealthOpen,
        setIsNodeHealthOpen,
        isBookingsOpen,
        setIsBookingsOpen,
        isMenuExpanded,
        setIsMenuExpanded,
        sidebarOffset,
        isDesktop,
        toggleOverview,
        toggleActivityLog,
        toggleNodeHealth,
        toggleBookings,
        closeAllPanels,
      }}
    >
      <div
        style={
          {
            "--sidebar-total-offset": `${sidebarOffset}px`,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </DashboardLayoutContext.Provider>
  );
}

export function useDashboardLayout() {
  const context = useContext(DashboardLayoutContext);
  if (context === undefined) {
    throw new Error(
      "useDashboardLayout must be used within a DashboardLayoutProvider",
    );
  }
  return context;
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface DashboardLayoutContextType {
  // Panel States
  isOverviewOpen: boolean;
  setIsOverviewOpen: (open: boolean) => void;
  isActivityLogOpen: boolean;
  setIsActivityLogOpen: (open: boolean) => void;
  
  // Sidebar States
  isMenuExpanded: boolean;
  setIsMenuExpanded: (expanded: boolean) => void;
  
  // Layout Helpers
  sidebarOffset: number;
  isDesktop: boolean;
  
  // Actions
  toggleOverview: () => void;
  toggleActivityLog: () => void;
  closeAllPanels: () => void;
}

const DashboardLayoutContext = createContext<DashboardLayoutContextType | undefined>(undefined);

export function DashboardLayoutProvider({ children, userRole }: { children: ReactNode; userRole?: string }) {
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  
  const location = useLocation();

  // Handle Responsive
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isDesktop = windowWidth >= 1024;

  // Reset panels on navigation
  useEffect(() => {
    setIsOverviewOpen(false);
    setIsActivityLogOpen(false);
  }, [location.pathname]);

  // Calculate Offset
  const sidebarOffset = userRole === "harbormaster" 
    ? (isDesktop ? (isMenuExpanded ? 288 : 112) : 16)
    : 16;

  // Actions
  const toggleOverview = () => {
    setIsOverviewOpen(!isOverviewOpen);
    setIsActivityLogOpen(false);
  };

  const toggleActivityLog = () => {
    setIsActivityLogOpen(!isActivityLogOpen);
    setIsOverviewOpen(false);
  };

  const closeAllPanels = () => {
    setIsOverviewOpen(false);
    setIsActivityLogOpen(false);
  };

  return (
    <DashboardLayoutContext.Provider
      value={{
        isOverviewOpen,
        setIsOverviewOpen,
        isActivityLogOpen,
        setIsActivityLogOpen,
        isMenuExpanded,
        setIsMenuExpanded,
        sidebarOffset,
        isDesktop,
        toggleOverview,
        toggleActivityLog,
        closeAllPanels,
      }}
    >
      <div style={{ "--sidebar-total-offset": `${sidebarOffset}px` } as React.CSSProperties}>
        {children}
      </div>
    </DashboardLayoutContext.Provider>
  );
}

export function useDashboardLayout() {
  const context = useContext(DashboardLayoutContext);
  if (context === undefined) {
    throw new Error("useDashboardLayout must be used within a DashboardLayoutProvider");
  }
  return context;
}

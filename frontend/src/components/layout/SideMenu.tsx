import { Activity, LayoutDashboard, Menu, Settings, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { cn } from "../../lib/utils";

interface SideMenuProps {
  isExpanded: boolean;
  onToggle: () => void;
  onOverviewToggle: () => void;
  onActivityLogToggle: () => void;
  isOverviewActive: boolean;
  isActivityLogActive: boolean;
}

export function SideMenu({
  isExpanded,
  onToggle,
  onOverviewToggle,
  onActivityLogToggle,
  isOverviewActive,
  isActivityLogActive,
}: SideMenuProps) {
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  const settingsPath = marinaSlug ? `/${marinaSlug}/settings` : null;

  const menuItems = [
    {
      id: "overview",
      icon: LayoutDashboard,
      label: "Harbor Overview",
      active: isOverviewActive,
      onClick: onOverviewToggle,
    },
    {
      id: "activity",
      icon: Activity,
      label: "Activity Log",
      active: isActivityLogActive,
      onClick: onActivityLogToggle,
    },
  ];

  return (
    <>
      {/* Desktop Sidebar (lg and up) */}
      <nav
        className={cn(
          "hidden lg:flex fixed left-4 top-24 bottom-6 z-[var(--z-nav)] pointer-events-auto flex-col bg-white/70 backdrop-blur-2xl border border-white/60 shadow-deep rounded-[32px] transition-all duration-500 ease-in-out overflow-hidden font-body py-6",
          isExpanded ? "w-64 px-6" : "w-20 px-4",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          title={isExpanded ? undefined : "Expand menu"}
          aria-label={isExpanded ? "Close menu" : "Expand menu"}
          className={cn(
            "rounded-2xl hover:bg-[#0A2540]/5 text-[#0A2540]/60 transition-all mb-8 flex items-center group w-full h-12 flex-shrink-0",
            isExpanded ? "px-3 gap-4" : "justify-center",
          )}
        >
          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
            {isExpanded ? (
              <X
                size={24}
                strokeWidth={2.5}
                className="text-[#0A2540]/80 animate-in spin-in-90 duration-300"
              />
            ) : (
              <Menu
                size={24}
                strokeWidth={2.5}
                className="group-hover:scale-110 transition-transform"
              />
            )}
          </div>
          <span
            className={cn(
              "font-black text-xs uppercase tracking-widest text-[#0A2540] transition-all duration-300 whitespace-nowrap overflow-hidden",
              isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0",
            )}
          >
            Close Menu
          </span>
        </button>

        <div className="flex-1 space-y-3 w-full">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              title={isExpanded ? undefined : item.label}
              aria-label={item.label}
              className={cn(
                "w-full flex items-center h-12 rounded-2xl transition-all group relative flex-shrink-0",
                isExpanded ? "px-3 gap-4" : "justify-center",
                item.active
                  ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/20"
                  : "hover:bg-[#0A2540]/5 text-[#0A2540]/40 hover:text-[#0A2540]/80",
              )}
            >
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                <item.icon
                  size={22}
                  strokeWidth={2.5}
                  className="transition-transform group-hover:scale-110"
                />
              </div>

              <span
                className={cn(
                  "font-black text-[11px] uppercase tracking-widest whitespace-nowrap transition-all duration-300 overflow-hidden",
                  isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0",
                )}
              >
                {item.label}
              </span>

              {!isExpanded && item.active && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              )}
            </button>
          ))}
        </div>

        {settingsPath && (
          <Link
            to={settingsPath}
            title={isExpanded ? undefined : "Settings"}
            aria-label="Settings"
            className={cn(
              "mt-auto flex items-center h-12 rounded-2xl hover:bg-[#0A2540]/5 text-[#0A2540]/40 hover:text-[#0A2540]/80 transition-all group w-full flex-shrink-0",
              isExpanded ? "px-3 gap-4" : "justify-center",
            )}
          >
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              <Settings
                size={22}
                strokeWidth={2.5}
                className="transition-transform group-hover:rotate-90"
              />
            </div>
            <span
              className={cn(
                "font-black text-[11px] uppercase tracking-widest whitespace-nowrap transition-all duration-300 overflow-hidden",
                isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0",
              )}
            >
              Settings
            </span>
          </Link>
        )}
      </nav>

      {/* Mobile Bottom Dock (below lg) */}
      <nav
        className={cn(
          // safe-area-inset-bottom keeps the dock above the home indicator
          "lg:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] left-1/2 -translate-x-1/2 z-[var(--z-nav)] pointer-events-auto w-[90%] max-w-sm h-16 bg-white/80 backdrop-blur-3xl border border-white/60 shadow-deep rounded-full flex items-center justify-around px-2 font-body",
        )}
      >
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            title={item.label}
            aria-label={item.label}
            className={cn(
              "flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all relative",
              item.active
                ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/30 scale-110 -translate-y-2"
                : "text-[#0A2540]/40",
            )}
          >
            <item.icon size={20} strokeWidth={2.5} />
            {item.active && (
              <span className="text-[7px] font-black uppercase tracking-tighter mt-0.5">
                {item.id === "overview" ? "Map" : "Log"}
              </span>
            )}
          </button>
        ))}

        {settingsPath && (
          <Link
            to={settingsPath}
            title="Settings"
            aria-label="Settings"
            className="flex items-center justify-center w-14 h-14 rounded-full text-[#0A2540]/40 hover:text-[#0A2540]/80 transition-all"
          >
            <Settings size={20} strokeWidth={2.5} />
          </Link>
        )}
      </nav>
    </>
  );
}

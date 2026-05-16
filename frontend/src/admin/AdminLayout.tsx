import {
  Activity,
  Anchor,
  Bell,
  Cable,
  CircleAlert,
  Cpu,
  Home,
  Mail,
  QrCode,
  Sailboat,
  ScrollText,
  Users,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils";
import { detectEnv } from "./env";

// admin host mounts spa at root, other hosts under /admin
const BASE =
  typeof window !== "undefined" && window.location.hostname.startsWith("admin.")
    ? ""
    : "/admin";

const NAV = [
  { to: `${BASE}` || "/", label: "Snapshot", icon: Home, end: true },
  { to: `${BASE}/harbors`, label: "Harbors", icon: Anchor, end: false },
  { to: `${BASE}/docks`, label: "Docks", icon: Cable, end: false },
  { to: `${BASE}/berths`, label: "Berths", icon: Sailboat, end: false },
  { to: `${BASE}/gateways`, label: "Gateways", icon: Cpu, end: false },
  { to: `${BASE}/nodes`, label: "Nodes", icon: ScrollText, end: false },
  {
    to: `${BASE}/adoptions`,
    label: "Adoptions",
    icon: CircleAlert,
    end: false,
  },
  {
    to: `${BASE}/factory-devices`,
    label: "Factory devices",
    icon: QrCode,
    end: false,
  },
  { to: `${BASE}/alerts`, label: "Alerts", icon: Bell, end: false },
  { to: `${BASE}/events`, label: "Events", icon: Activity, end: false },
  { to: `${BASE}/invites`, label: "Invites", icon: Mail, end: false },
  { to: `${BASE}/users`, label: "Users", icon: Users, end: false },
];

export function AdminLayout() {
  const env = detectEnv();

  return (
    // h-dvh + overflow-hidden on the outer pins the chrome to viewport so the
    // <main> can be the only scroll surface. globally body has overflow-hidden
    // (for the dashboard map), so each page must own its scroll
    <div className="h-dvh bg-brand-navy/5 flex flex-col overflow-hidden">
      <header
        className={cn(
          "px-6 py-2 text-xs font-black uppercase tracking-widest text-center flex-shrink-0",
          env.bannerClass,
        )}
      >
        DockPulse Admin · {env.label}
      </header>

      <div className="flex flex-1 min-h-0">
        <nav className="w-56 bg-white border-r border-black/5 p-4 space-y-1 overflow-y-auto flex-shrink-0">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold transition-all",
                  isActive
                    ? "bg-brand-blue/10 text-brand-blue"
                    : "text-brand-navy/70 hover:bg-brand-navy/5",
                )
              }
            >
              <Icon size={16} strokeWidth={2.5} />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 p-8 max-w-6xl overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

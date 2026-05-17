import { Info } from "lucide-react";
import { cn } from "../lib/utils";

const ROWS = [
  {
    key: "available",
    label: "Available",
    icon: (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="#10B981"
          strokeWidth="3"
        />
      </svg>
    ),
  },
  {
    key: "unavailable",
    label: "Unavailable",
    icon: (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <g stroke="#EF4444" strokeWidth="3">
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="4" y1="12" x2="12" y2="4" />
        </g>
      </svg>
    ),
  },
  {
    key: "offline",
    label: "Offline",
    icon: (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="3" fill="rgba(10, 37, 64, 0.35)" />
      </svg>
    ),
  },
];

export function MapLegend({
  hasBottomDock = false,
  shiftLeft = false,
}: {
  hasBottomDock?: boolean;
  shiftLeft?: boolean;
}) {
  return (
    // flat, integrated vertical legend that sits directly on the page for a clean and discrete look
    <aside
      aria-label="Berth status legend"
      className={cn(
        "pointer-events-none fixed z-40 flex flex-col items-start gap-2 font-body transition-all duration-500 ease-in-out",
        shiftLeft
          ? "right-5 md:right-[504px] lg:right-[376px]"
          : "right-5 lg:right-6",
        hasBottomDock
          ? "bottom-[calc(env(safe-area-inset-bottom)+7.5rem)]"
          : "bottom-[calc(env(safe-area-inset-bottom)+1.75rem)]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Info size={11} strokeWidth={2.5} className="text-brand-blue" />
        <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-navy/60">
          Berth Status
        </span>
      </div>

      <ul className="space-y-1.5">
        {ROWS.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center">
              {row.icon}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-navy/60">
              {row.label}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

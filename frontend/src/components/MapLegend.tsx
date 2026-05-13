import { Info } from "lucide-react";

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

export function MapLegend() {
  return (
    <aside
      aria-label="Berth status legend"
      className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+7rem)] right-5 z-[120] rounded-2xl border border-white/60 bg-white/70 px-3 py-2.5 shadow-deep backdrop-blur-2xl lg:bottom-6 lg:right-6"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Info size={11} strokeWidth={2.5} className="text-brand-blue" />
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-brand-navy/60">
          Berth Status
        </span>
      </div>

      <ul className="space-y-1.5">
        {ROWS.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center">
              {row.icon}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/60">
              {row.label}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

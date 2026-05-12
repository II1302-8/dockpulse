import { X as CloseIcon, Info } from "lucide-react";
import { useState } from "react";

export function MapLegend() {
  const [isOpen, setIsOpen] = useState(false);

  function openLegend(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsOpen(true);
  }

  function closeLegend(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsOpen(false);
  }

  return (
    <div className="pointer-events-none fixed left-5 top-28 z-[120] flex flex-col items-start gap-2 opacity-70 transition-opacity duration-300 hover:opacity-100 lg:left-[21rem] lg:top-32 lg:opacity-60">
      {/* Legend Content */}
      <div
        className={`pointer-events-auto rounded-2xl bg-transparent p-2 transition-all duration-300 ease-in-out ${
          isOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-3 opacity-0 lg:pointer-events-auto lg:translate-y-0 lg:opacity-100"
        }`}
      >
        {/* Mobile Close */}
        <div className="mb-2 flex items-center justify-end lg:hidden">
          <button
            type="button"
            onPointerUp={closeLegend}
            className="rounded-full p-1 text-[#0A2540]/40 transition-colors hover:text-[#0A2540]/80 active:scale-95"
            aria-label="Hide legend"
          >
            <CloseIcon size={12} strokeWidth={3} />
          </button>
        </div>

        {/* Legend Items */}
        <div className="space-y-2">
          {/* Available */}
          <div className="flex items-center gap-2">
            <div className="flex h-4 w-4 items-center justify-center">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="3"
                />
              </svg>
            </div>

            <span className="text-[10px] font-bold uppercase tracking-wider text-[#0A2540]/40">
              Available
            </span>
          </div>

          {/* Unavailable */}
          <div className="flex items-center gap-2">
            <div className="flex h-4 w-4 items-center justify-center">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <g stroke="#EF4444" strokeWidth="3">
                  <line x1="4" y1="4" x2="12" y2="12" />
                  <line x1="4" y1="12" x2="12" y2="4" />
                </g>
              </svg>
            </div>

            <span className="text-[10px] font-bold uppercase tracking-wider text-[#0A2540]/40">
              Unavailable
            </span>
          </div>

          {/* Offline */}
          <div className="flex items-center gap-2">
            <div className="flex h-4 w-4 items-center justify-center">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="3" fill="rgba(10, 37, 64, 0.2)" />
              </svg>
            </div>

            <span className="text-[10px] font-bold uppercase tracking-wider text-[#0A2540]/40">
              Offline
            </span>
          </div>
        </div>
      </div>

      {/* Mobile Toggle */}
      {!isOpen && (
        <button
          type="button"
          onPointerUp={openLegend}
          className="pointer-events-auto rounded-full p-2 text-[#0A2540]/40 transition-transform active:scale-95 lg:hidden"
          aria-label="Show legend"
        >
          <Info size={16} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

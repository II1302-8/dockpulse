import { X as CloseIcon, Info } from "lucide-react";
import { useState } from "react";

export function MapLegend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed top-32 left-8 lg:left-[21rem] z-[55] flex flex-col items-start gap-2 pointer-events-none opacity-40 hover:opacity-100 transition-opacity duration-300">
      {/* Desktop / Expanded Legend */}
      <div
        className={`p-2 transition-all duration-500 ease-in-out pointer-events-auto ${
          isOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-4 lg:opacity-100 lg:translate-y-0"
        }`}
      >
        <div className="flex items-center justify-between mb-2 lg:hidden">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-full text-[#0A2540]/40 hover:text-[#0A2540]/80"
          >
            <CloseIcon size={12} strokeWidth={3} />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 flex items-center justify-center">
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
            <span className="text-[10px] font-bold text-[#0A2540]/40 uppercase tracking-wider">
              Available
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-4 h-4 flex items-center justify-center">
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
            <span className="text-[10px] font-bold text-[#0A2540]/40 uppercase tracking-wider">
              Occupied
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-4 h-4 flex items-center justify-center">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="3" fill="rgba(10, 37, 64, 0.2)" />
              </svg>
            </div>
            <span className="text-[10px] font-bold text-[#0A2540]/40 uppercase tracking-wider">
              Offline
            </span>
          </div>
        </div>
      </div>

      {/* Mobile Toggle */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="lg:hidden p-2 text-[#0A2540]/40 pointer-events-auto active:scale-95 transition-transform"
          aria-label="Show Legend"
        >
          <Info size={16} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

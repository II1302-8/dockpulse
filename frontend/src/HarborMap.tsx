import panzoom from "panzoom";
import { useCallback, useEffect, useRef, useState } from "react";
import { BerthDetailPanel } from "./components/BerthDetailPanel";
import { HarborOverview } from "./components/HarborOverview";
import { useBerthsStream } from "./hooks/useBerthsStream";
import { SvgMap } from "./svgMap";

export function HarborMap() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { berths, isLoading, error, refetchACB } = useBerthsStream();
  const [selectedBerthId, setSelectedBerthId] = useState<string | null>(null);

  useEffect(function panzoomEffectCB() {
    if (!contentRef.current) return;

    const instance = panzoom(contentRef.current, {
      maxZoom: 8,
      minZoom: 0.1,
      smoothScroll: true,
      zoomDoubleClickSpeed: 1,
      // Ensure we can drag even when clicking on empty space
      bounds: false,
    });

    return () => instance.dispose();
  }, []);

  const handleBerthClickCB = useCallback((berthId: string) => {
    setSelectedBerthId(berthId);
  }, []);

  const handleClosePanelCB = useCallback(() => {
    setSelectedBerthId(null);
  }, []);

  const showInitialSpinner = isLoading && berths.length === 0;

  return (
    <div className="w-full h-full relative overflow-hidden font-body bg-transparent">
      <section
        ref={contentRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-10"
      >
        <SvgMap
          berths={berths}
          selectedBerthId={selectedBerthId}
          onBerthClickCB={handleBerthClickCB}
        />
      </section>

      {showInitialSpinner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#F4F9FF]/80 backdrop-blur-md z-[80]">
          <div className="w-12 h-12 border-4 border-[#0093E9]/20 border-t-[#0093E9] rounded-full animate-spin" />
          <p className="text-xs font-black text-[#0A2540]/60 animate-pulse uppercase tracking-widest">
            Initialising Marina HUD...
          </p>
        </div>
      )}

      {error && !showInitialSpinner && (
        <div
          className="fixed top-28 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 bg-white/95 border border-red-500/20 rounded-2xl shadow-deep z-[90] animate-in slide-in-from-top-4"
          role="alert"
        >
          <span className="text-sm font-bold text-red-500">{error}</span>
          <button
            type="button"
            className="px-4 py-2 bg-[#0A2540] text-white rounded-full text-xs font-bold hover:bg-[#0093E9] transition-colors"
            onClick={refetchACB}
          >
            Retry
          </button>
        </div>
      )}

      <HarborOverview berths={berths} />

      {selectedBerthId && (
        <BerthDetailPanel
          berthId={selectedBerthId}
          onCloseCB={handleClosePanelCB}
        />
      )}
    </div>
  );
}

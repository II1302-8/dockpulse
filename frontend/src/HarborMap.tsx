import panzoom from "panzoom";
import { useCallback, useEffect, useRef, useState } from "react";
import BerthDetailPanel from "./components/BerthDetailPanel";
import HarborOverview from "./components/HarborOverview";
import { useBerths } from "./hooks/useBerths";
import SvgMap from "./svgMap";

export default function HarborMap() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { berths, isLoading, error, refetch } = useBerths();
  const [selectedBerthId, setSelectedBerthId] = useState<string | null>(null);

  useEffect(function panzoomEffect() {
    if (!contentRef.current) return;

    const instance = panzoom(contentRef.current, {
      maxZoom: 8,
      minZoom: 0.5,
      smoothScroll: false,
      zoomDoubleClickSpeed: 1,
    });

    return () => instance.dispose();
  }, []);

  const handleBerthClickCB = useCallback((berthId: string) => {
    setSelectedBerthId(berthId);
  }, []);

  const handleClosePanelCB = useCallback(() => {
    setSelectedBerthId(null);
  }, []);

  if (isLoading) {
    return (
      <div className="harbor-map-wrapper">
        <div className="loading-container">
          <div className="spinner" />
          <p
            style={{
              color: "var(--color-text-secondary)",
              fontWeight: 500,
              fontSize: "0.9rem",
            }}
          >
            Fetching harbor status...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="harbor-map-wrapper">
        <div className="error-container">
          <p className="error-message">{error}</p>
          <button type="button" className="btn-retry" onClick={refetch}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="harbor-map-container">
      <section className="harbor-map-wrapper">
        <div ref={contentRef} className="harbor-map-content">
          <SvgMap
            berths={berths}
            selectedBerthId={selectedBerthId}
            onBerthClickCB={handleBerthClickCB}
          />
        </div>
      </section>

      {selectedBerthId ? (
        <BerthDetailPanel
          berthId={selectedBerthId}
          onCloseCB={handleClosePanelCB}
        />
      ) : (
        <HarborOverview berths={berths} />
      )}
    </main>
  );
}

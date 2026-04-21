import panzoom from "panzoom";
import { useCallback, useEffect, useRef, useState } from "react";
import BerthDetailPanel from "./components/BerthDetailPanel";
import HarborOverview from "./components/HarborOverview";
import { useBerthsStream } from "./hooks/useBerthsStream";
import SvgMap from "./svgMap";

export default function HarborMap() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { berths, isLoading, error, refetch } = useBerthsStream();
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

  const showInitialSpinner = isLoading && berths.length === 0;

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
        {showInitialSpinner && (
          <div className="map-overlay">
            <div className="spinner" />
            <p className="map-overlay-text">Fetching harbor status...</p>
          </div>
        )}
        {error && !showInitialSpinner && (
          <div className="map-banner" role="alert">
            <span className="map-banner-text">{error}</span>
            <button type="button" className="btn-retry" onClick={refetch}>
              Retry
            </button>
          </div>
        )}
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

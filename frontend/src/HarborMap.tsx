import panzoom from "panzoom";
import { useEffect, useRef } from "react";
import { useBerths } from "./hooks/useBerths";
import SvgMap from "./svgMap";

export default function HarborMap() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { berths, isLoading, error, refetch } = useBerths();

  useEffect(() => {
    if (!contentRef.current) return;

    const instance = panzoom(contentRef.current, {
      maxZoom: 8,
      minZoom: 0.5,
      smoothScroll: false,
      zoomDoubleClickSpeed: 1,
    });

    return () => instance.dispose();
  }, []);

  const showInitialSpinner = isLoading && berths.length === 0;

  return (
    <div className="harbor-map-wrapper">
      <div ref={contentRef} className="harbor-map-content">
        <SvgMap berths={berths} />
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
    </div>
  );
}

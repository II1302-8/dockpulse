import panzoom from "panzoom";
import { useEffect, useRef } from "react";
import { useBerths } from "./hooks/useBerths";
import SvgMap from "./svgMap";

export default function HarborMap() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { berths, isLoading, error, refetch } = useBerths();

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
    <div className="harbor-map-wrapper">
      <div ref={contentRef} className="harbor-map-content">
        <SvgMap berths={berths} />
      </div>
    </div>
  );
}

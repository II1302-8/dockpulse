import panzoom from "panzoom";
import { useEffect, useRef } from "react";
import SvgMap from "./svgMap";

export default function HarborMap() {
  const contentRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="harbor-map-wrapper">
      <div ref={contentRef} className="harbor-map-content">
        <SvgMap />
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react"; // Import React hooks
import { createRoot } from "react-dom/client"; // Import function to create a React root manually
import type { Root } from "react-dom/client"; // Import Root type for TypeScript
import SvgMap from "./svgMap"; // Import the SVG harbor overlay component

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; // Read Google Maps API key from env file

const HARBOR_CENTER = {
  lat: 59.276228, // Harbor center latitude
  lng: 18.314767, // Harbor center longitude
};

const SVG_BOUNDS = {
  north: 59.27705, // Top map bound for SVG overlay
  south: 59.27540, // Bottom map bound for SVG overlay
  east: 18.31595, // Right map bound for SVG overlay
  west: 18.31355, // Left map bound for SVG overlay
};

const MIN_OVERLAY_ZOOM = 17; // Minimum zoom where SVG overlay becomes visible
const WHITE_MAP_ZOOM = 16; // Minimum zoom where base map becomes white
const MAX_CENTER_DISTANCE_DEGREES = 0.005; // Max allowed distance from harbor center

const WHITE_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#ffffff" }] }, // CSS-like map styling
  { elementType: "labels", stylers: [{ visibility: "off" }] }, // CSS-like map styling
  { featureType: "administrative", stylers: [{ visibility: "off" }] }, // CSS-like map styling
  { featureType: "poi", stylers: [{ visibility: "off" }] }, // CSS-like map styling
  { featureType: "road", stylers: [{ visibility: "off" }] }, // CSS-like map styling
  { featureType: "transit", stylers: [{ visibility: "off" }] }, // CSS-like map styling
  { featureType: "water", stylers: [{ color: "#ffffff" }] }, // CSS-like map styling
  { featureType: "landscape", stylers: [{ color: "#ffffff" }] }, // CSS-like map styling
];

let googleMapsLoadingPromise: Promise<void> | null = null; // Store script-loading promise so Google Maps is only loaded once

function loadGoogleMaps(): Promise<void> {
  const win = window as typeof window & { google?: any }; // Extend window type to include google

  if (win.google?.maps) {
    return Promise.resolve(); // If Google Maps is already loaded, return resolved promise
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error("Missing Google Maps API key.")); // Reject if API key is missing
  }

  if (googleMapsLoadingPromise) {
    return googleMapsLoadingPromise; // Reuse existing loading promise if script is already being loaded
  }

  googleMapsLoadingPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[data-google-maps="true"]'
    ) as HTMLScriptElement | null; // Look for an already-added Google Maps script

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true }); // Resolve when existing script finishes loading
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps script.")), // Reject if existing script fails
        { once: true }
      );
      return; // Stop here if script already exists
    }

    const script = document.createElement("script"); // Create new script element
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=weekly`; // Set Google Maps script URL
    script.async = true; // Script loading setting
    script.defer = true; // Script loading setting
    script.dataset.googleMaps = "true"; // Add custom attribute so it can be identified later

    script.onload = () => resolve(); // Resolve promise when script loads successfully
    script.onerror = () =>
      reject(new Error("Failed to load Google Maps script.")); // Reject promise if script fails

    document.head.appendChild(script); // Add script to page head
  });

  return googleMapsLoadingPromise; // Return the loading promise
}

function isCenterNearHarbor(center: any): boolean {
  if (!center) return false; // Return false if there is no map center

  const latDiff = Math.abs(center.lat() - HARBOR_CENTER.lat); // Calculate latitude difference
  const lngDiff = Math.abs(center.lng() - HARBOR_CENTER.lng); // Calculate longitude difference

  return (
    latDiff <= MAX_CENTER_DISTANCE_DEGREES && // Check allowed latitude range
    lngDiff <= MAX_CENTER_DISTANCE_DEGREES // Check allowed longitude range
  );
}

export default function HarborMap() {
  const containerRef = useRef<HTMLDivElement | null>(null); // Ref for the div where Google Map will be mounted
  const [error, setError] = useState<string | null>(null); // State for error message

  useEffect(() => {
    let cancelled = false; // Track whether component has unmounted
    let map: any = null; // Store Google Map instance
    let overlay: any = null; // Store SVG overlay instance
    let listeners: Array<{ remove: () => void }> = []; // Store map listeners for cleanup

    async function init() {
      try {
        await loadGoogleMaps(); // Wait until Google Maps script is loaded

        const win = window as typeof window & { google?: any }; // Extend window type again
        const google = win.google; // Read global google object

        if (cancelled || !containerRef.current || !google?.maps) return; // Stop if component is gone or map cannot be created

        const OverlayView = google.maps.OverlayView; // Get Google Maps overlay base class
        const LatLng = google.maps.LatLng; // Get LatLng class
        const LatLngBounds = google.maps.LatLngBounds; // Get LatLngBounds class
        const Map = google.maps.Map; // Get Map class

        if (!OverlayView || !LatLng || !LatLngBounds || !Map) {
          throw new Error("Google Maps not fully available"); // Throw if required Google Maps classes are missing
        }

        class SvgOverlay extends OverlayView {
          private bounds: any; // Store geographic bounds for overlay
          private div: HTMLDivElement | null = null; // Store outer overlay div
          private root: Root | null = null; // Store React root for SVG rendering
          private visible = false; // Track whether overlay should be visible

          constructor(bounds: {
            north: number; // Type for north bound
            south: number; // Type for south bound
            east: number; // Type for east bound
            west: number; // Type for west bound
          }) {
            super(); // Call parent OverlayView constructor

            this.bounds = new LatLngBounds(
              new LatLng(bounds.south, bounds.west), // Create southwest corner
              new LatLng(bounds.north, bounds.east) // Create northeast corner
            );
          }

          onAdd() {
            this.div = document.createElement("div"); // Create outer overlay container
            this.div.style.position = "absolute"; // CSS styling
            this.div.style.transition = "opacity 250ms ease"; // CSS styling
            this.div.style.opacity = "0"; // CSS styling
            this.div.style.background = "transparent"; // CSS styling
            this.div.style.pointerEvents = "auto"; // CSS styling

            const content = document.createElement("div"); // Create inner content container
            content.style.width = "100%"; // CSS styling
            content.style.height = "100%"; // CSS styling
            content.style.pointerEvents = "auto"; // CSS styling
            this.div.appendChild(content); // Put inner content inside outer container

            this.root = createRoot(content); // Create React root inside overlay content
            this.root.render(<SvgMap />); // Render SVG map into overlay

            const panes = this.getPanes(); // Get Google Maps pane layers
            panes?.overlayMouseTarget.appendChild(this.div); // Add overlay to clickable pane
          }

          draw() {
            if (!this.div) return; // Stop if overlay div does not exist

            const projection = this.getProjection(); // Get projection from geographic coords to screen coords
            if (!projection) return; // Stop if projection is unavailable

            const sw = projection.fromLatLngToDivPixel(this.bounds.getSouthWest()); // Convert southwest bound to pixel position
            const ne = projection.fromLatLngToDivPixel(this.bounds.getNorthEast()); // Convert northeast bound to pixel position

            if (!sw || !ne) return; // Stop if conversion failed

            const left = sw.x; // Calculate left position
            const top = ne.y; // Calculate top position
            const width = ne.x - sw.x; // Calculate overlay width
            const height = sw.y - ne.y; // Calculate overlay height

            this.div.style.left = `${left}px`; // CSS styling
            this.div.style.top = `${top}px`; // CSS styling
            this.div.style.width = `${width}px`; // CSS styling
            this.div.style.height = `${height}px`; // CSS styling
            this.div.style.opacity = this.visible ? "1" : "0"; // CSS styling
          }

          onRemove() {
            if (this.root) {
              this.root.unmount(); // Unmount React tree from overlay
              this.root = null; // Clear React root reference
            }

            if (this.div?.parentNode) {
              this.div.parentNode.removeChild(this.div); // Remove overlay div from DOM
            }

            this.div = null; // Clear overlay div reference
          }

          setVisible(visible: boolean) {
            this.visible = visible; // Save visibility state
            if (this.div) {
              this.div.style.opacity = visible ? "1" : "0"; // CSS styling
              this.div.style.pointerEvents = visible ? "auto" : "none"; // CSS styling
            }
          }
        }

        map = new Map(containerRef.current, {
          center: HARBOR_CENTER, // Set initial map center
          zoom: 16, // Set initial zoom
          mapTypeId: "satellite", // Set initial map type
          streetViewControl: false, // Map UI setting
          fullscreenControl: true, // Map UI setting
          mapTypeControl: false, // Map UI setting
          gestureHandling: "greedy", // Map interaction setting
          disableDefaultUI: false, // Map UI setting
          backgroundColor: "#ffffff", // CSS-like map styling
        });

        overlay = new SvgOverlay(SVG_BOUNDS); // Create SVG overlay using map bounds
        overlay.setMap(map); // Attach overlay to Google Map

        const updateVisibility = () => {
          if (!map || !overlay) return; // Stop if map or overlay is missing

          const zoom = map.getZoom() ?? 0; // Read current map zoom
          const center = map.getCenter(); // Read current map center
          const nearHarbor = isCenterNearHarbor(center); // Check if center is close to harbor

          const shouldUseWhiteMap = zoom >= WHITE_MAP_ZOOM && nearHarbor; // Decide when to switch to white map
          const shouldShowOverlay = zoom >= MIN_OVERLAY_ZOOM && nearHarbor; // Decide when to show SVG overlay

          if (shouldUseWhiteMap) {
            map.setMapTypeId("roadmap"); // Switch map type to roadmap
            map.setOptions({ styles: WHITE_MAP_STYLES }); // Apply white map styles
          } else {
            map.setOptions({ styles: null }); // Remove custom styles
            map.setMapTypeId("satellite"); // Switch back to satellite
          }

          overlay.setVisible(shouldShowOverlay); // Show or hide overlay
          overlay.draw(); // Recalculate overlay size and position
        };

        listeners = [
          map.addListener("zoom_changed", updateVisibility), // Update overlay when zoom changes
          map.addListener("center_changed", updateVisibility), // Update overlay when center changes
          map.addListener("idle", updateVisibility), // Update overlay when map stops moving
        ];

        updateVisibility(); // Run initial visibility update
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load Google Map."; // Build safe error message
        setError(message); // Save error in state
      }
    }

    init(); // Start map initialization

    return () => {
      cancelled = true; // Mark component as unmounted
      listeners.forEach((listener) => listener.remove()); // Remove all Google Maps listeners

      if (overlay) {
        overlay.setMap(null); // Remove overlay from map
      }

      map = null; // Clear map reference
    };
  }, []); // Run effect only once on mount

  if (error) {
    return (
      <div style={styles.errorBox}> {/* CSS styling */}
        <p style={styles.errorText}>{error}</p> {/* CSS styling */}
      </div>
    );
  }

  return <div ref={containerRef} style={styles.map} />; // Render container where Google Map will appear
}

const styles = {
  map: {
    width: "100%", // CSS styling
    height: "100%", // CSS styling
    minHeight: "500px", // CSS styling
    borderRadius: "8px", // CSS styling
    overflow: "hidden", // CSS styling
    position: "relative" as const, // CSS styling
    backgroundColor: "#ffffff", // CSS styling
  },
  errorBox: {
    width: "100%", // CSS styling
    height: "100%", // CSS styling
    minHeight: "500px", // CSS styling
    display: "flex", // CSS styling
    alignItems: "center", // CSS styling
    justifyContent: "center", // CSS styling
    border: "2px solid #111111", // CSS styling
    borderRadius: "8px", // CSS styling
    backgroundColor: "#ffffff", // CSS styling
    padding: "20px", // CSS styling
    boxSizing: "border-box" as const, // CSS styling
  },
  errorText: {
    margin: 0, // CSS styling
    color: "#111111", // CSS styling
    fontSize: "18px", // CSS styling
    fontWeight: 600, // CSS styling
    textAlign: "center" as const, // CSS styling
  },
};

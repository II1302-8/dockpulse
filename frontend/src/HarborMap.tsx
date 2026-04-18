import { useEffect, useRef, useState } from "react"; // Import React hooks.
import type { Root } from "react-dom/client"; // Import the React root type only.
import { createRoot } from "react-dom/client"; // Import React root creation for the overlay.
import SvgMap from "./svgMap"; // Import the SVG harbor overlay component.

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; // Read the API key from the local .env file through Vite.

const HARBOR_CENTER = {
  lat: 59.276228, // Store the harbor center latitude.
  lng: 18.314767, // Store the harbor center longitude.
};

const SVG_BOUNDS = {
  north: 59.27705, // Store the north bound of the SVG overlay.
  south: 59.2754, // Store the south bound of the SVG overlay.
  east: 18.31595, // Store the east bound of the SVG overlay.
  west: 18.31355, // Store the west bound of the SVG overlay.
};

const MIN_OVERLAY_ZOOM = 17; // Define the minimum zoom where the SVG overlay becomes visible.
const WHITE_MAP_ZOOM = 16; // Define the zoom where the map switches to a white simplified style.
const MAX_CENTER_DISTANCE_DEGREES = 0.005; // Define how far from the harbor center the user may pan before overlay hides.

const WHITE_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#ffffff" }] }, // Make geometry white.
  { elementType: "labels", stylers: [{ visibility: "off" }] }, // Hide labels.
  { featureType: "administrative", stylers: [{ visibility: "off" }] }, // Hide administrative details.
  { featureType: "poi", stylers: [{ visibility: "off" }] }, // Hide points of interest.
  { featureType: "road", stylers: [{ visibility: "off" }] }, // Hide roads.
  { featureType: "transit", stylers: [{ visibility: "off" }] }, // Hide transit.
  { featureType: "water", stylers: [{ color: "#ffffff" }] }, // Make water white.
  { featureType: "landscape", stylers: [{ color: "#ffffff" }] }, // Make landscape white.
] as const; // Mark the map styles as readonly constants.

type MapCenter = {
  lat: () => number; // Return the center latitude.
  lng: () => number; // Return the center longitude.
};

type MapsEventListener = {
  remove: () => void; // Remove the Google Maps listener.
};

type GoogleMapInstance = {
  getZoom: () => number | undefined; // Read the current zoom.
  getCenter: () => MapCenter | null; // Read the current map center.
  setMapTypeId: (mapTypeId: string) => void; // Change the map type.
  setOptions: (options: { styles: typeof WHITE_MAP_STYLES | null }) => void; // Change map styles.
  addListener: (eventName: string, handler: () => void) => MapsEventListener; // Register a map event listener.
};

type OverlayPanes = {
  overlayMouseTarget: Element; // Access the pane that can receive pointer events.
};

type Projection = {
  fromLatLngToDivPixel: (
    latLng: LatLngInstance,
  ) => { x: number; y: number } | null; // Convert coordinates to overlay pixels.
};

type OverlayInstance = {
  setMap: (map: GoogleMapInstance | null) => void; // Attach or detach the overlay from the map.
  setVisible: (visible: boolean) => void; // Show or hide the overlay.
  draw: () => void; // Force a redraw of the overlay.
};

type LatLngInstance = {
  lat: () => number; // Return latitude.
  lng: () => number; // Return longitude.
};

type LatLngBoundsInstance = {
  getSouthWest: () => LatLngInstance; // Return the south-west corner.
  getNorthEast: () => LatLngInstance; // Return the north-east corner.
};

type OverlayViewInstance = {
  getPanes: () => OverlayPanes | null; // Access overlay panes.
  getProjection: () => Projection | null; // Access the map projection.
  setMap: (map: GoogleMapInstance | null) => void; // Attach or detach the overlay.
};

type OverlayViewConstructor = new () => OverlayViewInstance; // Describe the OverlayView class constructor.

type LatLngConstructor = new (lat: number, lng: number) => LatLngInstance; // Describe the LatLng class constructor.

type LatLngBoundsConstructor = new (
  southWest: LatLngInstance,
  northEast: LatLngInstance,
) => LatLngBoundsInstance; // Describe the LatLngBounds class constructor.

type GoogleMapConstructor = new (
  element: HTMLElement,
  options: {
    center: { lat: number; lng: number }; // Provide the map center.
    zoom: number; // Provide the initial zoom.
    mapTypeId: string; // Provide the initial map type.
    streetViewControl: boolean; // Toggle Street View control.
    fullscreenControl: boolean; // Toggle fullscreen control.
    mapTypeControl: boolean; // Toggle map type control.
    gestureHandling: string; // Set gesture behavior.
    disableDefaultUI: boolean; // Toggle default UI.
    backgroundColor: string; // Set background color.
  },
) => GoogleMapInstance; // Describe the Google Map class constructor.

type GoogleMapsNamespace = {
  maps?: {
    OverlayView?: OverlayViewConstructor; // Expose OverlayView.
    LatLng?: LatLngConstructor; // Expose LatLng.
    LatLngBounds?: LatLngBoundsConstructor; // Expose LatLngBounds.
    Map?: GoogleMapConstructor; // Expose Map.
  };
};

type GoogleMapsWindow = Window & {
  google?: GoogleMapsNamespace; // Extend window with the google namespace.
};

let googleMapsLoadingPromise: Promise<void> | null = null; // Cache the Google Maps script load promise.

function loadGoogleMaps(): Promise<void> {
  const win = window as GoogleMapsWindow; // Read the browser window as a typed Google Maps window.

  if (win.google?.maps) {
    return Promise.resolve(); // Resolve immediately if Maps is already loaded.
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error("Google Maps configuration is missing.")); // Reject if the local env key is missing.
  }

  if (googleMapsLoadingPromise) {
    return googleMapsLoadingPromise; // Reuse the same loading promise if one already exists.
  }

  googleMapsLoadingPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[data-google-maps="true"]',
    ) as HTMLScriptElement | null; // Check whether the script already exists.

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), {
        once: true,
      }); // Resolve when the existing script finishes loading.
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps.")),
        { once: true },
      ); // Reject if the existing script fails.
      return; // Stop here because the script is already present.
    }

    const script = document.createElement("script"); // Create the Google Maps script element.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=weekly`; // Build the script URL using the env key.
    script.async = true; // Load asynchronously.
    script.defer = true; // Defer execution until HTML parsing is done.
    script.dataset.googleMaps = "true"; // Mark the script so it can be found later.

    script.onload = () => resolve(); // Resolve on successful load.
    script.onerror = () => reject(new Error("Failed to load Google Maps.")); // Reject on load failure.

    document.head.appendChild(script); // Add the script to the page.
  });

  return googleMapsLoadingPromise; // Return the cached loading promise.
}

function isCenterNearHarbor(center: MapCenter | null): boolean {
  if (!center) return false; // Return false if the map center is missing.

  const latDiff = Math.abs(center.lat() - HARBOR_CENTER.lat); // Measure latitude distance from harbor center.
  const lngDiff = Math.abs(center.lng() - HARBOR_CENTER.lng); // Measure longitude distance from harbor center.

  return (
    latDiff <= MAX_CENTER_DISTANCE_DEGREES &&
    lngDiff <= MAX_CENTER_DISTANCE_DEGREES
  ); // Only return true when the map center is close enough.
}

export default function HarborMap() {
  const containerRef = useRef<HTMLDivElement | null>(null); // Store the map container DOM node.
  const [error, setError] = useState<string | null>(null); // Store any loading error.

  useEffect(() => {
    let cancelled = false; // Track whether the component has been unmounted.
    let map: GoogleMapInstance | null = null; // Store the Google Map instance.
    let overlay: OverlayInstance | null = null; // Store the SVG overlay instance.
    let listeners: MapsEventListener[] = []; // Store map listeners for cleanup.

    async function init() {
      try {
        await loadGoogleMaps(); // Wait for Google Maps to load.

        const win = window as GoogleMapsWindow; // Read the window using the Google Maps type.
        const googleObject = win.google; // Access the google object.

        if (cancelled || !containerRef.current || !googleObject?.maps) {
          return; // Stop if the component is gone or Maps is unavailable.
        }

        const OverlayViewMaybe = googleObject.maps.OverlayView;
        const LatLngMaybe = googleObject.maps.LatLng;
        const LatLngBoundsMaybe = googleObject.maps.LatLngBounds;
        const GoogleMapMaybe = googleObject.maps.Map;

        if (
          !OverlayViewMaybe ||
          !LatLngMaybe ||
          !LatLngBoundsMaybe ||
          !GoogleMapMaybe
        ) {
          throw new Error("Google Maps not fully available.");
        }

        const OverlayView: OverlayViewConstructor = OverlayViewMaybe;
        const LatLng: LatLngConstructor = LatLngMaybe;
        const LatLngBounds: LatLngBoundsConstructor = LatLngBoundsMaybe;
        const GoogleMap: GoogleMapConstructor = GoogleMapMaybe;

        class SvgOverlay extends OverlayView {
          private bounds: LatLngBoundsInstance; // Store the overlay bounds.
          private div: HTMLDivElement | null = null; // Store the overlay container div.
          private root: Root | null = null; // Store the React root used to render the SVG.
          private visible = false; // Track whether the overlay should be visible.

          constructor(bounds: {
            north: number; // Accept a north bound.
            south: number; // Accept a south bound.
            east: number; // Accept an east bound.
            west: number; // Accept a west bound.
          }) {
            super(); // Call the parent OverlayView constructor.

            this.bounds = new LatLngBounds(
              new LatLng(bounds.south, bounds.west),
              new LatLng(bounds.north, bounds.east),
            ); // Convert the plain bounds to Google Maps bounds.
          }

          onAdd() {
            this.div = document.createElement("div"); // Create the outer overlay div.
            this.div.style.position = "absolute"; // Position the overlay absolutely.
            this.div.style.transition = "opacity 250ms ease"; // Animate overlay visibility.
            this.div.style.opacity = "0"; // Start hidden.
            this.div.style.background = "transparent"; // Keep background transparent.
            this.div.style.pointerEvents = "auto"; // Allow pointer interaction when visible.

            const content = document.createElement("div"); // Create an inner div for React rendering.
            content.style.width = "100%"; // Match the overlay width.
            content.style.height = "100%"; // Match the overlay height.
            content.style.pointerEvents = "auto"; // Allow clicks inside the SVG.
            this.div.appendChild(content); // Append the inner content div.

            this.root = createRoot(content); // Create a React root in the content div.
            this.root.render(<SvgMap />); // Render the SVG map into the overlay.

            const panes = this.getPanes(); // Access the overlay panes.
            panes?.overlayMouseTarget.appendChild(this.div); // Add the overlay to the mouse target pane.
          }

          draw() {
            if (!this.div) return; // Stop if the overlay div does not exist.

            const projection = this.getProjection(); // Access the projection object.
            if (!projection) return; // Stop if projection is unavailable.

            const sw = projection.fromLatLngToDivPixel(
              this.bounds.getSouthWest(),
            ); // Convert south-west bound to pixels.
            const ne = projection.fromLatLngToDivPixel(
              this.bounds.getNorthEast(),
            ); // Convert north-east bound to pixels.

            if (!sw || !ne) return; // Stop if either conversion fails.

            const left = sw.x; // Calculate overlay left position.
            const top = ne.y; // Calculate overlay top position.
            const width = ne.x - sw.x; // Calculate overlay width.
            const height = sw.y - ne.y; // Calculate overlay height.

            this.div.style.left = `${left}px`; // Apply left position.
            this.div.style.top = `${top}px`; // Apply top position.
            this.div.style.width = `${width}px`; // Apply width.
            this.div.style.height = `${height}px`; // Apply height.
            this.div.style.opacity = this.visible ? "1" : "0"; // Apply visibility.
          }

          onRemove() {
            if (this.root) {
              this.root.unmount(); // Unmount the React overlay.
              this.root = null; // Clear the root reference.
            }

            if (this.div?.parentNode) {
              this.div.parentNode.removeChild(this.div); // Remove the overlay element from the DOM.
            }

            this.div = null; // Clear the div reference.
          }

          setVisible(visible: boolean) {
            this.visible = visible; // Update the visibility state.

            if (this.div) {
              this.div.style.opacity = visible ? "1" : "0"; // Update the current DOM opacity.
              this.div.style.pointerEvents = visible ? "auto" : "none"; // Disable clicks when hidden.
            }
          }
        }

        map = new GoogleMap(containerRef.current, {
          center: HARBOR_CENTER, // Set the initial map center.
          zoom: 16, // Set the initial zoom.
          mapTypeId: "satellite", // Start with the satellite map type.
          streetViewControl: false, // Hide Street View control.
          fullscreenControl: true, // Show fullscreen control.
          mapTypeControl: false, // Hide map type control.
          gestureHandling: "greedy", // Allow gesture interactions freely.
          disableDefaultUI: false, // Keep default controls enabled.
          backgroundColor: "#ffffff", // Set a white fallback background.
        });

        overlay = new SvgOverlay(SVG_BOUNDS); // Create the SVG overlay.
        overlay.setMap(map); // Attach the overlay to the map.

        const updateVisibility = () => {
          if (!map || !overlay) return; // Stop if map or overlay is missing.

          const zoom = map.getZoom() ?? 0; // Read the current zoom safely.
          const center = map.getCenter(); // Read the current center.
          const nearHarbor = isCenterNearHarbor(center); // Check whether the center is near the harbor.

          const shouldUseWhiteMap = zoom >= WHITE_MAP_ZOOM && nearHarbor; // Decide whether to use the white roadmap.
          const shouldShowOverlay = zoom >= MIN_OVERLAY_ZOOM && nearHarbor; // Decide whether to show the SVG overlay.

          if (shouldUseWhiteMap) {
            map.setMapTypeId("roadmap"); // Switch to roadmap when near the harbor.
            map.setOptions({ styles: WHITE_MAP_STYLES }); // Apply the simplified white style.
          } else {
            map.setOptions({ styles: null }); // Remove custom styles.
            map.setMapTypeId("satellite"); // Switch back to satellite view.
          }

          overlay.setVisible(shouldShowOverlay); // Toggle overlay visibility.
          overlay.draw(); // Redraw the overlay.
        };

        listeners = [
          map.addListener("zoom_changed", updateVisibility), // Update on zoom changes.
          map.addListener("center_changed", updateVisibility), // Update on center changes.
          map.addListener("idle", updateVisibility), // Update once map motion settles.
        ];

        updateVisibility(); // Apply the correct initial map and overlay state.
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load Google Map."; // Build a safe error message.

        setError(message); // Save the error message for rendering.
      }
    }

    void init(); // Start the async initialization.

    return () => {
      cancelled = true; // Mark the effect as cancelled.

      listeners.forEach((listener) => {
        listener.remove(); // Remove each registered listener.
      });

      if (overlay) {
        overlay.setMap(null); // Detach the overlay from the map.
      }

      map = null; // Clear the map reference.
      overlay = null; // Clear the overlay reference.
      listeners = []; // Clear listener references.
    };
  }, []); // Run only once on mount.

  if (error) {
    return (
      <div style={styles.errorBox}>
        <p style={styles.errorText}>{error}</p>
      </div>
    ); // Render an error state if loading failed.
  }

  return <div ref={containerRef} style={styles.map} />; // Render the Google Map container.
}

const styles = {
  map: {
    width: "100%", // Make the map fill its parent width.
    height: "100%", // Make the map fill its parent height.
    minHeight: "500px", // Keep a minimum visible height.
    borderRadius: "8px", // Round the corners.
    overflow: "hidden", // Hide overflow outside rounded corners.
    position: "relative" as const, // Use relative positioning for overlays.
    backgroundColor: "#ffffff", // Keep a white background while loading.
  },
  errorBox: {
    width: "100%", // Make the error box fill its parent width.
    height: "100%", // Make the error box fill its parent height.
    minHeight: "500px", // Keep a minimum visible height.
    display: "flex", // Use flex layout.
    alignItems: "center", // Center content vertically.
    justifyContent: "center", // Center content horizontally.
    border: "2px solid #111111", // Add a visible border.
    borderRadius: "8px", // Round the corners.
    backgroundColor: "#ffffff", // Keep the error box white.
    padding: "20px", // Add inner spacing.
    boxSizing: "border-box" as const, // Include padding and border in sizing.
  },
  errorText: {
    margin: 0, // Remove default paragraph margin.
    color: "#111111", // Use dark text.
    fontSize: "18px", // Set readable text size.
    fontWeight: 600, // Use semi-bold text.
    textAlign: "center" as const, // Center the text.
  },
}; // Define inline styles for the component.

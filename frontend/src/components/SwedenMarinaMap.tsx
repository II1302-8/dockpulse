import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Anchor, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  getMarinaMapStatus,
  MARINA_LIST,
  type MarinaInfo,
  SWEDEN_MAP_CENTER,
  SWEDEN_MAP_ZOOM,
} from "../lib/marinas";
import { cn } from "../lib/utils";

function MapFitBounds() {
  const map = useMap();

  useEffect(() => {
    if (MARINA_LIST.length < 2) return;
    const bounds = L.latLngBounds(MARINA_LIST.map((m) => m.position));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 5 });
  }, [map]);

  return null;
}

function MarinaTooltipContent({
  marina,
  isHovered,
}: {
  marina: MarinaInfo;
  isHovered: boolean;
}) {
  const status = getMarinaMapStatus(marina);

  return (
    <div
      className={cn(
        "marina-map-tip",
        status === "coming-soon" && "marina-map-tip--soon",
        status === "not-planned" && "marina-map-tip--not-planned",
        isHovered && "marina-map-tip--active",
      )}
    >
      <div className="marina-map-tip__header">
        <span className="marina-map-tip__icon" aria-hidden>
          <Anchor size={14} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="marina-map-tip__name">{marina.name}</p>
          {marina.region && (
            <p className="marina-map-tip__region">{marina.region}</p>
          )}
        </div>
      </div>
      {marina.tagline && (
        <p className="marina-map-tip__tagline">{marina.tagline}</p>
      )}
      <p className="marina-map-tip__cta">
        {status === "not-planned"
          ? "Not planned"
          : status === "coming-soon"
            ? "Coming soon"
            : isHovered
              ? "Click to open harbor"
              : "Hover for details"}
      </p>
    </div>
  );
}

function MarinaMarker({
  marina,
  isHovered,
  onHover,
}: {
  marina: MarinaInfo;
  isHovered: boolean;
  onHover: (slug: string | null) => void;
}) {
  const navigate = useNavigate();
  const status = getMarinaMapStatus(marina);

  const eventHandlers = useMemo(
    () => ({
      mouseover: () => onHover(marina.slug),
      mouseout: () => onHover(null),
      click: () => {
        if (status === "not-planned") {
          toast.error(`${marina.name} · not planned`, {
            description: "No rollout planned for this location.",
          });
          return;
        }
        if (status === "coming-soon") {
          toast.info(`${marina.name} is not on DockPulse yet`, {
            description:
              "This marina is on the roadmap. Saltsjöbaden is live today.",
          });
          return;
        }
        navigate(`/${marina.slug}`);
      },
    }),
    [marina.name, marina.slug, navigate, onHover, status],
  );

  const pathOptions = useMemo(() => {
    if (status === "not-planned") {
      return {
        color: "#7f1d1d",
        weight: isHovered ? 2 : 1.5,
        fillColor: isHovered ? "#ef4444" : "#dc2626",
        fillOpacity: isHovered ? 1 : 0.88,
      };
    }
    if (status === "coming-soon") {
      return {
        color: "#0a2540",
        weight: isHovered ? 2 : 1.5,
        fillColor: isHovered ? "#94a3b8" : "#cbd5e1",
        fillOpacity: isHovered ? 0.9 : 0.7,
      };
    }
    return {
      color: "#0a2540",
      weight: isHovered ? 2 : 1.5,
      fillColor: isHovered ? "#00e5ff" : "#0093e9",
      fillOpacity: isHovered ? 1 : 0.85,
    };
  }, [isHovered, status]);

  const radius =
    status === "live" ? (isHovered ? 7 : 6) : isHovered ? 7 : 5;

  return (
    <CircleMarker
      center={marina.position}
      radius={radius}
      pathOptions={pathOptions}
      eventHandlers={eventHandlers}
    >
      <Tooltip
        permanent={isHovered}
        direction="top"
        offset={[0, -10]}
        opacity={1}
        className="marina-map-tooltip"
      >
        <MarinaTooltipContent marina={marina} isHovered={isHovered} />
      </Tooltip>
    </CircleMarker>
  );
}

export function SwedenMarinaMap() {
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  return (
    <MapContainer
      center={SWEDEN_MAP_CENTER}
      zoom={SWEDEN_MAP_ZOOM}
      minZoom={4}
      maxZoom={12}
      className="h-full w-full z-0"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapFitBounds />
      {MARINA_LIST.map((marina) => (
        <MarinaMarker
          key={marina.slug}
          marina={marina}
          isHovered={hoveredSlug === marina.slug}
          onHover={setHoveredSlug}
        />
      ))}

      <div className="marina-map-hint pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-1/2 z-[var(--z-controls)] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/50 shadow-deep backdrop-blur-xl md:left-6 md:translate-x-0">
        <MapPin size={12} className="text-brand-blue" aria-hidden />
        Hover a marina · click to open
      </div>
    </MapContainer>
  );
}

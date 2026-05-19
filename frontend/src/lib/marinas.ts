/** WGS84 [latitude, longitude] */
export type LatLng = [number, number];

/** Pin style on the Nordic marina picker map */
export type MarinaMapStatus = "live" | "coming-soon" | "not-planned";

/**
 * Marina "metadata" configuration
 */
export interface MarinaInfo {
  name: string;
  slug: string;
  /** harbor_id for API + SSE; required for live marinas (must match backend seed) */
  harborId: string;
  position: LatLng;
  /** e.g. "Stockholm archipelago" — shown on the Sweden map hover card */
  region?: string;
  /** Short line under the name on hover */
  tagline?: string;
  /** Shown on the map but not routable until backend + harbor map exist */
  comingSoon?: boolean;
  mapStatus?: MarinaMapStatus;
}

export function getMarinaMapStatus(marina: MarinaInfo): MarinaMapStatus {
  if (marina.mapStatus) return marina.mapStatus;
  if (marina.comingSoon) return "coming-soon";
  if (marina.harborId) return "live";
  return "coming-soon";
}

/** Default view before fit-bounds runs (Nordic / Baltic overview) */
export const SWEDEN_MAP_CENTER: LatLng = [62.5, 15];
export const SWEDEN_MAP_ZOOM = 4;

const soon = {
  comingSoon: true as const,
  harborId: "",
  tagline: "DockPulse · coming soon",
};

function swedenCoast(
  name: string,
  slug: string,
  position: LatLng,
  coast: string,
): MarinaInfo {
  return { name, slug, position, region: `Sweden · ${coast}`, ...soon };
}

/** Swedish coast (south → north, then west), all coming soon */
const SWEDEN_COAST_MARINAS: MarinaInfo[] = [
  swedenCoast("Trelleborg", "trelleborg", [55.375, 13.157], "Skåne south"),
  swedenCoast("Ystad", "ystad", [55.429, 13.82], "Skåne east"),
  swedenCoast("Simrishamn", "simrishamn", [55.556, 14.35], "Österlen"),
  swedenCoast("Helsingborg", "helsingborg", [56.046, 12.694], "Skåne west"),
  swedenCoast("Landskrona", "landskrona", [55.871, 12.83], "Öresund"),
  swedenCoast("Malmö", "malmo", [55.605, 12.994], "Skåne"),
  swedenCoast("Höganäs", "hoganas", [56.199, 12.561], "Kullaberg"),
  swedenCoast("Halmstad", "halmstad", [56.6745, 12.8578], "Halland"),
  swedenCoast("Falkenberg", "falkenberg", [56.905, 12.489], "Halland north"),
  swedenCoast("Varberg", "varberg", [57.107, 12.25], "Halland coast"),
  swedenCoast("Göteborg", "goteborg", [57.7089, 11.9746], "Västra Götaland"),
  swedenCoast("Marstrand", "marstrand", [57.886, 11.586], "Bohuslän"),
  swedenCoast("Lysekil", "lysekil", [58.273, 11.439], "Bohuslän north"),
  swedenCoast("Uddevalla", "uddevalla", [58.348, 11.942], "Bohuslän east"),
  swedenCoast("Strömstad", "stromstad", [58.939, 11.171], "Bohuslän border"),
  swedenCoast("Karlskrona", "karlskrona", [56.1615, 15.586], "Blekinge"),
  swedenCoast("Kalmar", "kalmar", [56.663, 16.362], "Småland east"),
  swedenCoast("Oskarshamn", "oskarshamn", [57.264, 16.448], "Småland coast"),
  swedenCoast("Västervik", "vastervik", [57.759, 16.637], "Tjust"),
  swedenCoast("Visby", "visby", [57.6348, 18.2948], "Gotland"),
  swedenCoast("Nyköping", "nykoping", [58.753, 17.008], "Sörmland coast"),
  swedenCoast("Oxelösund", "oxelosund", [58.994, 17.109], "Sörmland north"),
  swedenCoast("Stockholm", "stockholm", [59.325, 18.071], "Capital harbor"),
  swedenCoast("Sandhamn", "sandhamn", [59.289, 18.908], "Stockholm archipelago"),
  swedenCoast("Öregrund", "oregrund", [60.338, 18.45], "Roslagen"),
  swedenCoast("Gävle", "gavle", [60.674, 17.142], "Gästrikland"),
  swedenCoast("Sundsvall", "sundsvall", [62.391, 17.306], "Västernorrland"),
  swedenCoast("Örnsköldsvik", "ornskoldsvik", [63.29, 18.715], "High Coast"),
  swedenCoast("Umeå", "umea", [63.826, 20.259], "Västerbotten"),
  swedenCoast("Skellefteå", "skelleftea", [64.751, 20.95], "Västerbotten north"),
  swedenCoast("Piteå", "pitea", [65.317, 21.479], "Norrbottens kust"),
  swedenCoast("Luleå", "lulea", [65.5842, 22.1546], "Norrbottens kust"),
];

/** All pins on the marina picker map (live + upcoming) */
export const MARINA_LIST: MarinaInfo[] = [
  {
    name: "Saltsjöbaden",
    slug: "saltsjobaden",
    harborId: "ksss-saltsjobaden",
    position: [59.2831, 18.3014],
    region: "Sweden · Stockholm archipelago",
    tagline: "KSSS · live harbor map",
  },

  ...SWEDEN_COAST_MARINAS,

  {
    name: "Copenhagen",
    slug: "copenhagen",
    position: [55.6761, 12.5683],
    region: "Denmark · Capital",
    ...soon,
  },
  {
    name: "Oslo",
    slug: "oslo",
    position: [59.9075, 10.7522],
    region: "Norway · Oslofjord",
    ...soon,
  },
  {
    name: "Helsinki",
    slug: "helsinki",
    position: [60.1699, 24.9384],
    region: "Finland · Gulf of Finland",
    ...soon,
  },
  {
    name: "Reykjavík",
    slug: "reykjavik",
    position: [64.1466, -21.9426],
    region: "Iceland",
    ...soon,
  },
  {
    name: "Edinburgh",
    slug: "edinburgh",
    position: [55.9533, -3.1883],
    region: "Scotland · Firth of Forth",
    ...soon,
  },
  {
    name: "Voravik",
    slug: "voravik",
    harborId: "",
    position: [56.888, 21.184],
    region: "Latvia",
    tagline: "Not planned",
    mapStatus: "not-planned",
  },
];

/** Routable marinas only — keys must match URL :marinaSlug */
export const MARINAS: Record<string, MarinaInfo> = Object.fromEntries(
  MARINA_LIST.filter((m) => getMarinaMapStatus(m) === "live").map((m) => [
    m.slug,
    m,
  ]),
);

/**
 * @param slug The marina slug from URL
 * @returns Formatted name
 */
export const getMarinaNameCB = (slug: string | undefined): string => {
  if (!slug) return "";
  const live = MARINAS[slug];
  if (live) return live.name;
  return (
    MARINA_LIST.find((m) => m.slug === slug)?.name ??
    slug.charAt(0).toUpperCase() + slug.slice(1)
  );
};

export function getHarborIdFromSlug(slug: string | undefined): string | null {
  if (!slug) return null;
  const harborId = MARINAS[slug]?.harborId;
  return harborId || null;
}

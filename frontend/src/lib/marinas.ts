/**
 * Marina "metadata" configuration
 */
export interface MarinaInfo {
  name: string;
  slug: string;
  // harbor_id used to scope API + SSE calls; must match backend seed data
  harborId: string;
}

export const MARINAS: Record<string, MarinaInfo> = {
  saltsjobaden: {
    name: "Saltsjöbaden",
    slug: "saltsjobaden",
    harborId: "ksss-saltsjobaden",
  },
};

/**
 * @param slug The marina slug from URL
 * @returns Formatted name
 */
export const getMarinaNameCB = (slug: string | undefined): string => {
  if (!slug) return "";
  return MARINAS[slug]?.name || slug.charAt(0).toUpperCase() + slug.slice(1);
};

export function getHarborIdFromSlug(slug: string | undefined): string | null {
  if (!slug) return null;
  return MARINAS[slug]?.harborId ?? null;
}

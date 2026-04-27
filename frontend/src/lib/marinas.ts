/**
 * Marina "metadata" configuration
 */
export interface MarinaInfo {
  name: string;
  slug: string;
}

export const MARINAS: Record<string, MarinaInfo> = {
  saltsjobaden: {
    name: "Saltsjöbaden",
    slug: "saltsjobaden",
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

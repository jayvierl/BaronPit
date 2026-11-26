/** Client-safe platform list (no server imports). */
export const PLATFORMS = [
  { id: "na1", label: "North America" },
  { id: "euw1", label: "EU West" },
  { id: "eun1", label: "EU Nordic & East" },
  { id: "kr", label: "Korea" },
  { id: "br1", label: "Brazil" },
  { id: "jp1", label: "Japan" },
  { id: "la1", label: "LAN" },
  { id: "la2", label: "LAS" },
  { id: "oc1", label: "Oceania" },
  { id: "tr1", label: "Türkiye" },
  { id: "ru", label: "Russia" },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

export function isPlatform(v: string): v is PlatformId {
  return PLATFORMS.some((p) => p.id === v);
}

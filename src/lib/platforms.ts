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

/** Keep the full Riot ID and its platform together when linking to recent form. */
export function playerStatsHref(platform: string, riotId: string): string {
  return "/player?" + new URLSearchParams({ platform, riotId });
}

/** A North America lookup can use its default tag. Explicit tags always take precedence. */
export function splitRiotId(value: string, platform: string): { gameName: string; tagLine: string } {
  const input = value.trim();
  const index = input.lastIndexOf("#");
  if (index < 0) return {gameName:input, tagLine:platform === "na1" && input ? "NA1" : ""};
  return {gameName:input.slice(0,index).trim(), tagLine:input.slice(index + 1).trim()};
}

export const LEAGUE_TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
export type LeagueTier = typeof LEAGUE_TIERS[number];
export function leagueTier(value: unknown): LeagueTier | null {
  return LEAGUE_TIERS.find(tier => tier === value) ?? null;
}

/** All public rank labels are formatted from the cached Riot fields. */
export function rankLabel(tier: string | null, division?: string | null, lp?: number | null): string {
  if (!tier) return "Unranked";
  const name = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  const rank = division ? `${name} ${division}` : name;
  return lp == null ? rank : `${rank} · ${lp} LP`;
}

/** All public rank labels are formatted from the cached Riot fields. */
export function rankLabel(tier: string | null, division?: string | null, lp?: number | null): string {
  if (!tier) return "Unranked";
  const name = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  const rank = division ? `${name} ${division}` : name;
  return lp == null ? rank : `${rank} · ${lp} LP`;
}

export function playerFlair(tier: string | null, division?: string | null, champion?: unknown) {
  const rank = rankLabel(tier, division);
  return typeof champion === "string" && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(champion) ? `${rank} · ${champion} main` : rank;
}

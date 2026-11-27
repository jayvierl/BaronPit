import { buildCatalog } from "./build-catalog";
import { championCatalog } from "./riot";
import { visibleChampionRoomSlugs } from "./rooms";

function normalized(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\p{M}\p{P}\s]/gu, "");
}

function catalogMatches<T extends { id: string | number; name: string }>(entries: T[], term: string, limit: number): T[] {
  const query = normalized(term);
  if (!query) return [];
  const matches = entries.map(entry => {
    const name = normalized(entry.name);
    const id = normalized(String(entry.id));
    const priority = name === query || id === query ? 0 : name.startsWith(query) ? 1 : name.includes(query) ? 2 : 3;
    return { entry, priority };
  });
  return matches.filter(result => result.priority < 3)
    .sort((a, b) => a.priority - b.priority || a.entry.name.localeCompare(b.entry.name) || String(a.entry.id).localeCompare(String(b.entry.id)))
    .slice(0, limit).map(result => result.entry);
}

export async function searchGameData(term: string, limit: 3 | 20) {
  const [champions, shop] = await Promise.all([championCatalog(), buildCatalog()]);
  const roster = catalogMatches(champions.list, term, limit);
  const roomSlugs = new Set(await visibleChampionRoomSlugs(roster.map(c => c.id)).catch(() => []));
  const items = catalogMatches(shop.items.filter(item => item.shop), term, limit);
  return {
    championPatch: champions.patch, itemPatch: shop.patch,
    champions: roster.map(c => ({ ...c, hasRoom: roomSlugs.has("champ-" + c.id.toLowerCase()) })),
    items,
  };
}

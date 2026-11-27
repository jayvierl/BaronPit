import { catalogText as plain } from "./catalog-text";
import bundled from "./build-catalog.json";
import { confirmedPatch } from "./riot";

export interface ShopItem {
  id: number;
  name: string;
  gold: number;
  effect: string;
  shop: boolean;
}
export interface RuneChoice {
  id: number;
  name: string;
  tree: string;
  slot: number;
  effect: string;
}
export interface BuildCatalog {
  patch: string;
  items: ShopItem[];
  runes: RuneChoice[];
}
type Dict = Record<string, unknown>;
const object = (value: unknown): Dict =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Dict) : {};
const catalogPatch = /^\d+\.\d+\.\d+$/;

export function parseBuildCatalog(patch: string, itemPayload: unknown, runePayload: unknown): BuildCatalog {
  if (!catalogPatch.test(patch) || object(itemPayload).version !== patch || !Array.isArray(runePayload))
    throw new Error("Invalid patch");
  const items: ShopItem[] = [];
  for (const [key, entry] of Object.entries(object(object(itemPayload).data))) {
    const i = object(entry),
      gold = object(i.gold);
    if (
      !/^\d{1,9}$/.test(key) ||
      !plain(i.name) ||
      !Number.isSafeInteger(gold.total) ||
      Number(gold.total) < 0
    )
      continue;
    items.push({
      id: Number(key),
      name: plain(i.name),
      gold: Number(gold.total),
      effect: plain(i.description) || plain(i.plaintext),
      shop:
        object(i.maps)["11"] === true &&
        gold.purchasable === true &&
        i.inStore !== false &&
        i.hideFromAll !== true,
    });
  }
  const runes: RuneChoice[] = [];
  for (const entry of runePayload) {
    const tree = object(entry),
      slots = tree.slots;
    if (!Array.isArray(slots) || !plain(tree.name)) continue;
    slots.forEach((entry, slot) => {
      const options = object(entry).runes;
      if (!Array.isArray(options)) return;
      for (const choice of options) {
        const rune = object(choice);
        if (Number.isSafeInteger(rune.id) && plain(rune.name))
          runes.push({
            id: Number(rune.id),
            name: plain(rune.name),
            tree: plain(tree.name),
            slot,
            effect: plain(rune.shortDesc),
          });
      }
    });
  }
  if (!items.length || !runes.length) throw new Error("Incomplete catalog");
  return { patch, items, runes };
}

let lastAvailable: BuildCatalog = bundled;
const patchReads = new Map<string, { promise: Promise<BuildCatalog | null>; retryAt: number }>();

async function loadPatchCatalog(patch: string): Promise<BuildCatalog> {
  const root = `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US`;
  const [items, runes] = await Promise.all(
    ["item", "runesReforged"].map(async (name) => {
      const response = await fetch(`${root}/${name}.json`, {
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Catalog unavailable");
      return response.json();
    }),
  );
  return parseBuildCatalog(patch, items, runes);
}

function exactBuildCatalog(patch: string): Promise<BuildCatalog | null> {
  if (patch === lastAvailable.patch) return Promise.resolve(lastAvailable);
  if (patch === bundled.patch) return Promise.resolve(bundled);
  if (!catalogPatch.test(patch)) return Promise.resolve(null);
  const existing = patchReads.get(patch);
  if (existing && Date.now() < existing.retryAt) return existing.promise;
  patchReads.delete(patch);
  if (patchReads.size >= 4) {
    const oldest = patchReads.keys().next().value;
    if (oldest) patchReads.delete(oldest);
  }
  const read = {
    promise: loadPatchCatalog(patch).then(catalog => {
      read.retryAt = Infinity;
      return catalog;
    }).catch(() => null),
    retryAt: Date.now() + 60_000,
  };
  patchReads.set(patch, read);
  return read.promise;
}

export async function currentBuildCatalog() {
  const patch = await confirmedPatch();
  const catalog = patch ? await exactBuildCatalog(patch) : null;
  if (catalog) lastAvailable = catalog;
  return { catalog: catalog ?? lastAvailable, current: catalog !== null };
}

export async function buildCatalog(patch?: string): Promise<BuildCatalog> {
  return patch ? (await exactBuildCatalog(patch)) ?? lastAvailable : (await currentBuildCatalog()).catalog;
}

export interface CardItem {
  id: number;
  name: string;
  effect: string;
  gold: number;
}
export function cardItems(catalog: BuildCatalog, ids: unknown): CardItem[] {
  if (!Array.isArray(ids)) return [];
  return ids.slice(0, 7).flatMap((id) => {
    const item = catalog.items.find((i) => i.id === id);
    return item ? [{ id: item.id, name: item.name, gold: item.gold, effect: item.effect.slice(0, 240) }] : [];
  });
}

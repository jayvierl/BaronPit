import { validId } from "./ids";
import type { BuildCatalog } from "./build-catalog";

type BuildsFilter = { champion?: string; item?: number; offMeta?: boolean; compose?: boolean; room?: boolean };
export type BuildKeystone = { id: number; name: string };

export function buildsHref({ champion, item, offMeta, compose, room }: BuildsFilter = {}) {
  const query = new URLSearchParams();
  if (champion) query.set("champ", champion);
  if (validId(item)) query.set("item", String(item));
  if (offMeta) query.set("offmeta", "1");
  if (compose) query.set("compose", "1");
  if (room && champion && compose) query.set("room", "1");
  return `/builds${query.size ? `?${query}` : ""}${compose ? "#compose" : ""}`;
}

export function buildItemId(value: unknown) {
  return typeof value === "string" && /^\d{1,9}$/.test(value) && validId(Number(value)) ? Number(value) : undefined;
}

export function buildDraftScope(champion: string | undefined, item: number | undefined, roomId: number | undefined, offMeta: boolean) {
  return `build:${champion ?? "all"}:${item ?? "all"}:${roomId ?? "global"}:${offMeta ? "off-meta" : "any"}`;
}

export function buildKeystone(value: unknown): BuildKeystone | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { id, name } = value as Record<string, unknown>;
  return validId(id) && typeof name === "string" && name === name.trim() && name.length > 0 && name.length <= 80 &&
    !/[\p{Cc}<>]/u.test(name) ? { id, name } : null;
}

export function verifyBuildLoadout(catalog: BuildCatalog, items: unknown, keystoneId: unknown) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 6 || !items.every(validId)) return null;
  const shopIds = new Set(catalog.items.filter(item => item.shop).map(item => item.id));
  if (!items.every(id => shopIds.has(id))) return null;
  if (keystoneId == null) return { items, keystone: null };
  const rune = catalog.runes.find(rune => rune.slot === 0 && rune.id === keystoneId);
  return rune ? { items, keystone: { id: rune.id, name: rune.name } } : null;
}

/** Only the build's own room, selected item, or a matching filtered build collection may be a thread return. */
export function buildThreadReturn(value: unknown, champion: unknown, items: unknown, room?: string | null) {
  if (typeof value !== "string" || value.length > 240 || !value.startsWith("/") || value.startsWith("//") || /[\\\p{Cc}]/u.test(value)) return null;
  const url = new URL(value, "https://build.invalid");
  if (url.origin !== "https://build.invalid" || url.hash) return null;
  const roomSlug = /^\/rooms\/(champ-[a-z0-9]+)$/.exec(url.pathname)?.[1];
  const championRoom = typeof champion === "string" && `champ-${champion.toLowerCase()}`;
  if (roomSlug && (roomSlug === room || roomSlug === championRoom) && url.searchParams.get("feed") === "builds") {
    return { href: `${url.pathname}?feed=builds`, label: "Back to champion room", roomSlug };
  }
  const item = buildItemId(/^\/items\/(\d+)$/.exec(url.pathname)?.[1]);
  if (item && Array.isArray(items) && items.includes(item)) return { href: `/items/${item}`, label: "Back to item" };
  if (url.pathname !== "/builds") return null;
  const chosen = url.searchParams.get("champ");
  if (chosen && (typeof champion !== "string" || chosen !== champion)) return null;
  const filteredItem = buildItemId(url.searchParams.get("item"));
  if (filteredItem && (!Array.isArray(items) || !items.includes(filteredItem))) return null;
  return { href: buildsHref({ champion: chosen ?? undefined, item: filteredItem, offMeta: url.searchParams.get("offmeta") === "1" }), label: "Back to builds" };
}

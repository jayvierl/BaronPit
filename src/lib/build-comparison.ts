import type { RuneChoice, ShopItem } from "./build-catalog";
import type { PostView } from "./post-types";
import { buildKeystone } from "./build-sharing";

export interface BuildPath {
  key: string;
  title: string;
  rationale: string;
  items: number[];
  runes: number[];
  runeNotes: string;
  secondaryTree: string;
  patch?: string;
  post?: number;
}
export function examplePaths(items: ShopItem[], runes: RuneChoice[]): BuildPath[] {
  const available = new Set(items.filter((i) => i.shop).map((i) => i.id));
  const availableRunes = new Set(runes.map((r) => r.id));
  return [
    {
      key: "protect",
      title: "Shield the first engage",
      items: [3111, 3190],
      runes: [8465],
      rationale:
        "An example support path for a magic-heavy engage. Tenacity can shorten eligible crowd control on you, and Locket gives nearby allies a shield.",
    },
    {
      key: "recover",
      title: "Recover through a long fight",
      items: [3158, 3107],
      runes: [8351],
      rationale:
        "An example for extended fights. Lucidity helps cycle utility spells. Redemption trades an immediate shield for a delayed area heal.",
    },
  ].map((p) => ({
    ...p,
    items: p.items.filter((id) => available.has(id)),
    runes: p.runes.filter((id) => availableRunes.has(id)),
    runeNotes: "",
    secondaryTree: "",
  }));
}

export function pathFromPost(
  post: Pick<PostView, "id" | "kind" | "status" | "authorName" | "body" | "data">,
  shopIds: Set<number>,
  keystoneIds?: ReadonlySet<number>,
): BuildPath | null {
  if (post.kind !== "build" || post.status !== "visible") return null;
  const items = post.data.items;
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > 6 ||
    !items.every((id) => Number.isSafeInteger(id) && shopIds.has(id))
  )
    return null;
  const keystone = buildKeystone(post.data.keystone);
  return {
    key: String(post.id),
    post: post.id,
    title: `${post.data.champion || "Community"} · ${post.authorName}`,
    rationale: post.body,
    items,
    runes: keystone && keystoneIds?.has(keystone.id) ? [keystone.id] : [],
    runeNotes: typeof post.data.runes === "string" ? post.data.runes : "",
    patch: typeof post.data.patch === "string" ? post.data.patch : undefined,
    secondaryTree: "",
  };
}
export function pathCost(ids: number[], catalog: Map<number, ShopItem>) {
  return ids.reduce((sum, id) => sum + (catalog.get(id)?.gold ?? 0), 0);
}

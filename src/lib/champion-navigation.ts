import { readSearchReturn } from "./search-scopes";

export const championClasses = ["Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"] as const;

export function championDirectoryFilters(q: unknown, tag: unknown) {
  return {
    q: typeof q === "string" ? q.slice(0, 80) : "",
    tag: championClasses.find(item => item === tag) ?? "",
  };
}

export function championDirectoryHref({ q, tag }: ReturnType<typeof championDirectoryFilters>, searchReturn?: string) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (tag) params.set("class", tag);
  if (searchReturn) params.set("from", searchReturn);
  return params.size ? `/champions?${params}` : "/champions";
}

export function readChampionDirectoryReturn(value: unknown): string | undefined {
  if (value === "/champions") return value;
  if (typeof value !== "string" || !value.startsWith("/champions?") || value.length > 1200) return undefined;
  const params = new URLSearchParams(value.slice("/champions?".length));
  return championDirectoryHref(championDirectoryFilters(params.get("q"), params.get("class")), readSearchReturn(params.get("from")));
}

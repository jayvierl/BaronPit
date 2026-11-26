import { isPlatform, type PlatformId } from "./platforms";

export const searchScopes = [
  { id: "all", label: "All" },
  { id: "people", label: "People" },
  { id: "rooms", label: "Rooms" },
  { id: "posts", label: "Posts" },
  { id: "players", label: "Player stats" },
] as const;

export type SearchScope = (typeof searchScopes)[number]["id"];

export function searchScope(value: unknown): SearchScope {
  return searchScopes.find(scope => scope.id === value)?.id ?? "all";
}

export function isExactRiotId(value: string): boolean {
  return /^[^#]+#[^#]+$/u.test(value);
}

export function searchHref(scope: SearchScope, query: string, region?: PlatformId, browse = false): string {
  const params = new URLSearchParams();
  if (scope !== "all") params.set("scope", scope);
  if (query) params.set("q", query);
  if (region) params.set("region", region);
  if (browse && scope === "players" && region && isExactRiotId(query)) params.set("results", "1");
  return params.size ? "/search?" + params : "/search";
}
export function readSearchReturn(value: unknown): string | undefined {
  if (value === "/search") return value;
  if (typeof value !== "string" || !value.startsWith("/search?") || value.length > 1200) return undefined;
  const params = new URLSearchParams(value.slice("/search?".length));
  const region = params.get("region") ?? "";
  return searchHref(searchScope(params.get("scope")), (params.get("q") ?? "").trim().slice(0, 80),
    isPlatform(region) ? region : undefined, true);
}

export function withSearchReturn(path: string, searchReturn?: string): string {
  if (!searchReturn) return path;
  const url = new URL(path, "https://ward.invalid");
  url.searchParams.set("from", searchReturn);
  return url.pathname + url.search + url.hash;
}

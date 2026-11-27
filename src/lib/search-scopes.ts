import { isPlatform, type PlatformId } from "./platforms";

export const searchScopes = [
  { id: "all", label: "All" },
  { id: "league", label: "Game data" },
  { id: "builds", label: "Builds" },
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
  const [name, tag, extra] = value.trim().split("#");
  if (!tag || extra !== undefined) return false;
  // A spaced hashtag usually belongs to a community search. Accept the common
  // written form “Jay Lewis #NA1” when its tag fits Riot’s short tag format.
  if (name !== name.trimEnd() && !/^[\p{L}\p{N}]{2,5}$/u.test(tag.trim())) return false;
  return name.trim().length > 0 && name.trim().length <= 32 && /^[\p{L}\p{N}]{1,16}$/u.test(tag.trim());
}

export function searchHref(scope: SearchScope, query: string, region?: PlatformId, browse = false): string {
  const params = new URLSearchParams();
  if (scope !== "all") params.set("scope", scope);
  if (query) params.set("q", query);
  if (region) params.set("region", region);
  if (browse && (scope === "all" || (scope === "players" && region)) && isExactRiotId(query)) params.set("results", "1");
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

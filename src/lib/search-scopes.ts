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

export function searchHref(scope: SearchScope, query: string): string {
  const params = new URLSearchParams();
  if (scope !== "all") params.set("scope", scope);
  if (query) params.set("q", query);
  return params.size ? "/search?" + params : "/search";
}

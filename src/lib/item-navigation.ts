type ItemParams = { q?: unknown; scope?: unknown; page?: unknown };

export function itemDirectoryFilters({ q, scope, page }: ItemParams) {
  return {
    query: typeof q === "string" ? q.trim().slice(0, 80) : "",
    allItems: scope === "all",
    page: typeof page === "string" && /^[1-9]\d{0,8}$/.test(page) ? Number(page) : 1,
  };
}

export function itemDirectoryHref({ query, allItems, page }: ReturnType<typeof itemDirectoryFilters>) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (allItems) params.set("scope", "all");
  if (page > 1) params.set("page", String(page));
  return params.size ? `/items?${params}` : "/items";
}

export function readItemDirectoryReturn(value: unknown) {
  if (value === "/items") return value;
  if (typeof value !== "string" || !value.startsWith("/items?") || value.length > 1200) return undefined;
  const params = new URLSearchParams(value.slice("/items?".length));
  return itemDirectoryHref(itemDirectoryFilters({ q: params.get("q"), scope: params.get("scope"), page: params.get("page") }));
}

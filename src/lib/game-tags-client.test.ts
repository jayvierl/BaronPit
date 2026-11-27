import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("retries a transient catalog failure and shares the successful request", async () => {
  const catalog = { championPatch: "16.23.1", itemPatch: "16.23.1", champions: [], items: [] };
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json(catalog));
  vi.stubGlobal("fetch", fetch);
  const { loadTagCatalog } = await import("./game-tags-client");
  expect(await loadTagCatalog()).toBeNull();
  const retry = loadTagCatalog();
  expect(loadTagCatalog()).toBe(retry);
  expect(await retry).toEqual(catalog);
  expect(await loadTagCatalog()).toEqual(catalog);
  expect(fetch).toHaveBeenCalledTimes(2);
});

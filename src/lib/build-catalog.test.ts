import { afterEach, expect, it, vi } from "vitest";
import { GET as shopResponse } from "@/app/api/shop/route";
import { buildCatalog, currentBuildCatalog, parseBuildCatalog, shopListed } from "./build-catalog";

const { confirmedPatch } = vi.hoisted(() => ({ confirmedPatch: vi.fn() }));
vi.mock("./riot", () => ({ confirmedPatch }));
afterEach(() => vi.unstubAllGlobals());

it("keeps the last verified current shop when an historical lookup succeeds and the newer shop fails", async () => {
  const versions = new Map([["16.24.1", "Current fixture"], ["16.20.1", "Historical fixture"]]);
  const fetchCatalog = vi.fn(async (url: string) => {
    const [, version, name] = /\/cdn\/([^/]+)\/data\/en_US\/([^/]+)\.json$/.exec(url) ?? [];
    const item = versions.get(version);
    if (!item) return new Response(null, { status: 503 });
    return name === "item"
      ? Response.json({ version, data: { "1001": { name: item, gold: { total: 300, purchasable: true }, maps: { 11: true } } } })
      : Response.json([{ name: "Resolve", slots: [{ runes: [{ id: 8465, name: "Guardian" }] }] }]);
  });
  vi.stubGlobal("fetch", fetchCatalog);
  confirmedPatch.mockResolvedValue("16.24.1");
  const [shop, sameShop] = await Promise.all([currentBuildCatalog(), currentBuildCatalog()]);
  expect(shop).toMatchObject({ current: true, catalog: { patch: "16.24.1", items: [{ name: "Current fixture" }] } });
  expect(sameShop.catalog).toBe(shop.catalog);
  expect(fetchCatalog).toHaveBeenCalledTimes(2);

  expect(await buildCatalog("16.20.1")).toMatchObject({ patch: "16.20.1", items: [{ name: "Historical fixture" }] });
  confirmedPatch.mockResolvedValue("16.25.1");
  const fallback = await shopResponse();
  expect(await fallback.json()).toMatchObject({ current: false, patch: "16.24.1", choices: [{ name: "Current fixture" }] });
  expect(fallback.headers.get("Cache-Control")).toBe("no-store");
  expect(await buildCatalog("16.20.1")).toMatchObject({ patch: "16.20.1" });
  expect(await buildCatalog()).toBe(shop.catalog);
  expect(fetchCatalog).toHaveBeenCalledTimes(6);

  confirmedPatch.mockResolvedValue(null);
  expect(await currentBuildCatalog()).toEqual({ current: false, catalog: shop.catalog });
});

it("keeps one shop entry per item name, preferring the standard cross-map entry over a mode variant", () => {
  // Real Data Dragon 16.23.1 shape: Abyssal Mask exists as the canonical
  // 8020 (2,650g, maps 11/12/453) and as the map-11-only variant 328020
  // (2,850g, different stats). Kalista's Black Spear is two genuinely
  // distinct entries separated by requiredChampion and must keep both.
  const entry = (name: string, total: number, maps: Record<string, boolean>, extra: Record<string, unknown> = {}) => ({
    name, description: "", gold: { total, purchasable: true }, maps, ...extra,
  });
  const catalog = parseBuildCatalog("16.23.1", {
    version: "16.23.1",
    data: {
      "8020": entry("Abyssal Mask", 2650, { "11": true, "12": true, "453": true }),
      "328020": entry("Abyssal Mask", 2850, { "11": true, "12": false, "453": false }),
      "3599": entry("Kalista's Black Spear", 0, { "11": true, "12": true, "453": true }, { requiredChampion: "Kalista" }),
      "3600": entry("Kalista's Black Spear", 0, { "11": true, "12": true, "453": true }, { requiredChampion: "Sylas" }),
      "1001": entry("Boots", 300, { "11": true, "12": true, "453": true }),
    },
  }, [{ name: "Resolve", slots: [{ runes: [{ id: 8465, name: "Guardian" }] }] }]);
  const listed = catalog.items.filter(shopListed);
  expect(listed.filter(item => item.name === "Abyssal Mask")).toEqual([
    expect.objectContaining({ id: 8020, gold: 2650 }),
  ]);
  // The variant stays in the catalog as a shop item (build comparisons can
  // still offer it, labelled by price and id) but is flagged as a variant so
  // directory-style lists show Abyssal Mask exactly once.
  expect(catalog.items.find(item => item.id === 328020)).toMatchObject({ shop: true, variant: true });
  expect(listed.filter(item => item.name === "Kalista's Black Spear").map(item => item.id)).toEqual([3599, 3600]);
  expect(listed.filter(item => item.name === "Boots")).toHaveLength(1);
});

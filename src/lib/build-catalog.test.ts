import { afterEach, expect, it, vi } from "vitest";
import { GET as shopResponse } from "@/app/api/shop/route";
import { buildCatalog, currentBuildCatalog } from "./build-catalog";

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

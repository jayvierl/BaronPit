import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCatalog, cardItems, parseBuildCatalog } from "./build-catalog";
import { examplePaths, pathCost, pathFromPost } from "./build-comparison";
import { ItemIcons } from "@/components/item-icons";

describe("patch-stamped build comparisons", () => {
  it("starts with real paths for an empty community and prices each chosen item", async () => {
    const catalog = await buildCatalog("16.23.1");
    const [a, b] = examplePaths(catalog.items, catalog.runes);
    const shop = new Map(catalog.items.filter((i) => i.shop).map((i) => [i.id, i]));
    expect(pathCost(a.items, shop)).toBe(3450);
    expect(pathCost(b.items, shop)).toBe(3200);
    expect(catalog.runes.find((r) => r.id === a.runes[0])?.name).toBe("Guardian");
    const details = cardItems(catalog, [3190, 0, -1]);
    expect(details).toHaveLength(1);
    expect(details[0].effect).toMatch(/shield/i);
    const html = renderToStaticMarkup(
      createElement(ItemIcons, { ids: [3190], patch: catalog.patch, details }),
    );
    expect(html).toContain('href="/items/3190"');
    expect(html).toContain("Locket of the Iron Solari, 2200 gold");
  });
  it("filters outdated or hidden community paths, while preserving original author text", () => {
    const base = {
      id: 11,
      kind: "build",
      status: "visible",
      authorName: "River",
      body: "For shorter trades",
      data: { items: [3190], runes: "Resolve", champion: "Ashe", patch: "16.20.1" },
    };
    expect(pathFromPost(base, new Set([3190]))).toMatchObject({
      post: 11,
      rationale: "For shorter trades",
      patch: "16.20.1",
      runeNotes: "Resolve",
    });
    expect(pathFromPost({ ...base, status: "held" }, new Set([3190]))).toBeNull();
    expect(pathFromPost(base, new Set())).toBeNull();
  });
  it("normalizes tagged Riot descriptions as plain text and rejects mismatched versions", () => {
    const input = {
      version: "17.1.1",
      data: {
        "1001": {
          name: "Boots",
          gold: { total: 300, purchasable: true },
          maps: { 11: true },
          description: "<stats>Move Speed</stats><br>Run &amp; walk",
        },
      },
    };
    const runes = [
      { name: "Precision", slots: [{ runes: [{ id: 1, name: "Stride", shortDesc: "<b>Move</b>" }] }] },
    ];
    expect(parseBuildCatalog("17.1.1", input, runes).items[0]).toMatchObject({
      shop: true,
      effect: "Move Speed\nRun & walk",
      id: 1001,
    });
    expect(() => parseBuildCatalog("17.2.1", input, runes)).toThrow();
  });
});

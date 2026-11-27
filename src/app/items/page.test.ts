import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import bundled from "@/lib/build-catalog.json";
import ItemsPage from "./page";
import ItemPage from "./[id]/page";

vi.mock("@/lib/riot", () => ({ confirmedPatch: async () => null }));

const index = async (params: Record<string, string | string[]> = {}) =>
  renderToStaticMarkup(await ItemsPage({ searchParams: Promise.resolve(params) }));
const detail = async (id: string, from?: string) =>
  renderToStaticMarkup(await ItemPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ from }) }));
const itemLinks = (markup: string) => Array.from(markup.matchAll(/href="(\/items\/(\d+)[^"]*)"/g), ([, href, id]) => ({ href, id }));

it("pages through shop items and returns from a detail to its exact directory page", async () => {
  const first = await index();
  expect(first).toContain("Last available Data Dragon catalog");
  const links = itemLinks(first);
  expect(links).toHaveLength(24);
  expect(first).toContain('href="/items?page=2"');
  expect(first).not.toContain('rel="prev"');
  const next = await index({ page: "2" });
  expect(next).toContain('rel="prev" href="/items"');
  expect(itemLinks(next)).toHaveLength(24);
  expect(new Set([...links, ...itemLinks(next)].map(item => item.id)).size).toBe(48);
  const item = itemLinks(next)[0];
  const from = new URL(item.href, "https://test.invalid").searchParams.get("from");
  expect(from).toBe("/items?page=2");
  expect(await detail(item.id, from!)).toContain('href="/items?page=2"');
  expect(await detail(item.id, "//other.invalid/items?page=9")).toContain('href="/items"');
  expect(itemLinks(await index({ page: ["2", "3"] }))).toEqual(links);
  const last = await index({ page: "99999" });
  expect(last).toContain('rel="prev"');
  expect(last).not.toContain('rel="next"');
});

it("finds catalog names and IDs and keeps non-shop items available in the full catalog", async () => {
  const item = bundled.items.find(entry => !entry.shop)!;
  expect(itemLinks(await index({ q: "Infinity Edge" })).map(link => link.id)).toContain("3031");
  expect(await index({ q: String(item.id) })).toContain("No items match");
  const full = await index({ q: String(item.id), scope: "all" });
  const [link] = itemLinks(full);
  expect(link.id).toBe(String(item.id));
  const from = new URL(link.href, "https://test.invalid").searchParams.get("from")!;
  expect(from).toBe(`/items?q=${item.id}&scope=all`);
  expect(await detail(link.id, from)).toContain(`href="/items?q=${item.id}&amp;scope=all"`);
});

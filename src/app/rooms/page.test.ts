import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import RoomsPage from "./page";

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/riot", () => ({ currentPatch: async () => "16.23.1" }));
vi.mock("@/lib/rooms", () => ({
  featuredRooms: () => [],
  listRooms: async () => Array.from({ length: 24 }, (_, i) => ({
    id: i + 1, name: i === 0 ? "Cho’Gath" : `Support ${i}`,
    slug: i === 0 ? "champ-chogath" : `support-${i}`, championId: null, joined: false,
  })),
}));

const render = async (params: { q?: string; limit?: string }) =>
  renderToStaticMarkup(await RoomsPage({ searchParams: Promise.resolve(params) }));

it("serves real search and paging destinations before JavaScript loads", async () => {
  const empty = await render({});
  expect(empty).toContain('action="/rooms#room-directory"');
  expect(empty).toContain('href="/rooms?limit=18#room-directory"');
  const first = await render({ q: "support" });
  expect(first).toContain('href="/rooms/support-18"');
  expect(first).not.toContain('href="/rooms/support-19"');
  expect(first).toContain('href="/rooms?q=support&amp;limit=36#room-directory"');
  expect(await render({ q: "support", limit: "36" })).toContain('href="/rooms/support-23"');
  expect(await render({ q: "Cho'Gath" })).toContain('href="/rooms/champ-chogath"');
  expect(await render({ q: "???" })).toContain("No rooms match this search.");
});

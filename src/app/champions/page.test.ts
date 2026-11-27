import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { postgres } from "../../../test/postgres";
import type { ChampionInfo } from "@/lib/riot";
import { readChampionDirectoryReturn } from "@/lib/champion-navigation";
import { searchHref } from "@/lib/search-scopes";
import { q } from "@/lib/db";
import { ensureRooms, getRoom, visibleChampionRoomSlugs } from "@/lib/rooms";
import ChampionsPage from "./page";

const state = vi.hoisted(() => ({ list: [] as ChampionInfo[], current: true }));
vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../../test/postgres")).neonForTests }));
vi.mock("@/lib/riot", () => ({ championCatalog: async () => ({ patch: "16.23.1", list: state.list, current: state.current }) }));

const database = "postgresql://local-fixture.invalid/champions";
const champion = (id: string): ChampionInfo => ({ id, name: id, title: "Fixture champion", tags: ["Mage"] });

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", database);
  vi.stubEnv("VERCEL_ENV", "development");
  state.list = [champion("Ashe"), champion("Ahri")];
  await ensureRooms();
}, 30000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});

it("shows the live room link and preserves builds for held or not-yet-seeded rooms", async () => {
  await q`UPDATE wp_rooms SET safety_status='held' WHERE slug='champ-ahri'`;
  state.list = [champion("Ashe"), champion("Ahri"), champion("Akali")];
  const html = renderToStaticMarkup(await ChampionsPage());

  expect(html).toContain('href="/rooms/champ-ashe"');
  expect(html).not.toContain('href="/rooms/champ-ahri"');
  expect(html).not.toContain('href="/rooms/champ-akali"');
  expect(html).not.toMatch(/\bheld\b|moderation/i);
  for (const id of ["Ashe", "Ahri", "Akali"]) expect(html).toContain(`href="/builds?champ=${id}"`);
  expect(html).toContain('aria-label="Filter champions"');
  expect(await getRoom("champ-ashe")).toMatchObject({ championId: "Ashe" });
  expect(await getRoom("champ-ahri")).toBeNull();
  expect(await getRoom("champ-akali")).toBeNull();
  expect(await visibleChampionRoomSlugs(["Ahri", "Akali"])).toEqual([]);
});

it("keeps the fallback catalog and build paths usable without room storage", async () => {
  vi.stubEnv("DATABASE_URL", "");
  state.list = [champion("Ashe")];
  state.current = false;
  try {
    const html = renderToStaticMarkup(await ChampionsPage());
    expect(html).toContain("Last available Data Dragon catalog");
    expect(html).toContain("26.23");
    expect(html).toContain('href="/builds?champ=Ashe"');
    expect(html).not.toContain('/rooms/champ-');
    expect(html).toContain('aria-label="Filter champions"');
  } finally {
    vi.stubEnv("DATABASE_URL", database);
    state.current = true;
  }
});

it("renders the name and class filters from the URL and gives the room an exact directory return", async () => {
  state.list = [champion("Ashe"), { ...champion("Ahri"), tags: ["Assassin"] }];
  const html = renderToStaticMarkup(await ChampionsPage({ searchParams: Promise.resolve({ q: "As", class: "Mage" }) }));
  expect(html).toContain("1 matching champion");
  expect(html).toContain('name="class"');
  expect(html).toContain('href="/rooms/champ-ashe?from=%2Fchampions%3Fq%3DAs%26class%3DMage"');
  expect(html).not.toContain('href="/builds?champ=Ahri"');
  expect(html).toContain('action="/champions"');
});

it("keeps the game search origin through catalog fallback, native filters, and room links", async () => {
  state.list = [champion("Ashe"), champion("Ahri")];
  const from = searchHref("league", "Ahri");
  const html = renderToStaticMarkup(await ChampionsPage({ searchParams: Promise.resolve({ q: "As", from }) }));
  const directory = `/champions?${new URLSearchParams({ q: "As", from })}`;
  expect(html).toContain('href="/search?scope=league&amp;q=Ahri"');
  expect(html).toContain('name="from" value="/search?scope=league&amp;q=Ahri"');
  expect(html).toContain(`href="/champions?${new URLSearchParams({ from })}"`);
  expect(html).toContain(`href="/rooms/champ-ashe?${new URLSearchParams({ from: directory })}"`);
  expect(readChampionDirectoryReturn(directory)).toBe(directory);
  const spoof = `/champions?${new URLSearchParams({ q: "As", from: "//outside.invalid/search" })}`;
  expect(readChampionDirectoryReturn(spoof)).toBe("/champions?q=As");
});

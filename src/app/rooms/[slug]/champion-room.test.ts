import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { readChampionDirectoryReturn } from "@/lib/champion-navigation";
import RoomPage from "./page";

const reads = vi.hoisted(() => ({ feed: vi.fn(), sample: vi.fn(), builds: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/rooms", () => ({ getRoom: async (slug: string) => ({
  id: 41, slug, championId: slug === "champ-ashe" ? "Ashe" : null,
  name: slug === "champ-ashe" ? "Ashe Mains" : "The Baron Pit", members: 3, joined: false,
  description: "A fixture room", host: null, raidUntil: null,
}) }));
vi.mock("@/lib/riot", () => ({ currentPatch: async () => "16.23.1", championList: async () => [
  { id: "Ashe", name: "Ashe", title: "the Frost Archer", tags: ["Marksman", "Support"] },
] }));
vi.mock("@/lib/room-feed", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/room-feed")>()), readRoomFeed: reads.feed,
}));
vi.mock("@/lib/player-insights", () => ({ championRoomPulse: reads.sample }));
vi.mock("@/lib/social", () => ({ buildFeed: reads.builds }));
vi.mock("@/components/guest-draft", () => ({ GuestPostDraft: ({ destination }: { destination: string }) =>
  createElement("a", { href: destination }, "Draft return") }));
vi.mock("@/components/safety-report", () => ({ SafetyReport: () => null }));
vi.mock("@/components/share-link", () => ({ ShareLink: () => null }));
vi.mock("@/components/ward-mascot", () => ({ WardEmptyState: ({ text, action }: { text: string; action: ReactNode }) =>
  createElement("div", null, text, action) }));
vi.mock("@/components/social-ui", () => ({ JoinButton: () => null }));
vi.mock("@/components/room-artwork", () => ({ RoomBanner: () => null }));

const search = "/search?scope=rooms&q=Ashe";
const directory = "/champions?q=Ashe&class=Marksman";
const render = async (query: Record<string, string> = {}, slug = "champ-ashe") =>
  renderToStaticMarkup(await RoomPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(query) }));

beforeEach(() => {
  reads.feed.mockReset().mockResolvedValue([]);
  reads.builds.mockReset().mockResolvedValue([]);
  reads.sample.mockReset().mockResolvedValue({ players: 2, games: 3, wins: 1,
    roles: [{ role: "BOTTOM", games: 2 }], topPlayers: [{name: "Fixture Player", tag: "NA1", platform: "na1", games: 2, wins: 1}],
  });
});

it("shows real sample counts, classes, observed roles and a bounded discussion preview", async () => {
  const html = await render({ from: directory });
  for (const marker of ["Recent match sample", "Champion classes", "Marksman", "Observed roles", "Latest discussions", "Wins · losses", "Back to champions"]) {
    expect(html).toContain(marker);
  }
  expect(html).toContain('href="/champions?q=Ashe&amp;class=Marksman"');
  expect(html).toContain('href="/player?platform=na1&amp;riotId=Fixture+Player%23NA1&amp;champion=Ashe#match-history"');
  expect(html).toMatch(/aria-current="page"[^>]*>Overview<\/a>/);
  expect(html).not.toContain("Sample win rate");
  expect(reads.feed).toHaveBeenCalledWith(41, null, expect.objectContaining({ key:"all" }), 4);
  expect(reads.sample).toHaveBeenCalledOnce();
});

it("keeps the search return through discussion filters and loads only the selected room facet", async () => {
  const discussion = await render({ feed: "questions", from: search });
  expect(discussion).toContain("Back to search");
  expect(discussion).toContain(`href="${search.replaceAll("&", "&amp;")}"`);
  expect(discussion).toMatch(/aria-current="page"[^>]*>Discussions<\/a>/);
  expect(discussion).toMatch(/aria-current="page"[^>]*>Questions<\/a>/);
  expect(discussion).toContain('href="/rooms/champ-ashe?feed=builds&amp;from=%2Fsearch%3Fscope%3Drooms%26q%3DAshe"');
  expect(reads.sample).not.toHaveBeenCalled();

  const builds = await render({ feed: "builds", from: search });
  expect(builds).toMatch(/aria-current="page"[^>]*>Builds<\/a>/);
  expect(builds).toContain("Community builds");
  expect(builds).toContain('href="/builds?champ=Ashe&amp;compose=1&amp;room=1#compose"');
  expect(builds).not.toContain("Recent match sample");
  expect(reads.feed).toHaveBeenCalledOnce();
  expect(reads.builds).toHaveBeenCalledWith(null, { champion:"Ashe" }, 12);
});

it("leaves general room filters intact and only allows local directory returns", async () => {
  const html = await render({ feed: "builds", from: "https://other.invalid/path" }, "general");
  expect(html).toContain("Room feed filters");
  expect(html).not.toContain("Champion hub");
  expect(html).not.toContain("other.invalid");
  expect(readChampionDirectoryReturn("//other.invalid/champions")).toBeUndefined();
  expect(readChampionDirectoryReturn("/champions?q=Ashe&class=Marksman&next=https://other.invalid")).toBe(directory);
});

it("opens the empty-room composer by native link and retains the sign-in return in both room layouts", async () => {
  const general = await render({}, "general");
  expect(general).toMatch(/href="\/rooms\/general\?compose=1#compose"[^>]*>Start the first thread/);
  expect(await render({ compose: "1" }, "general")).toMatch(/<details id="compose"[^>]*open=""/);

  const href = "/rooms/champ-ashe?view=discussions&amp;from=%2Fsearch%3Fscope%3Drooms%26q%3DAshe&amp;compose=1#compose";
  const hub = await render({ view: "discussions", from: search });
  expect(hub).toContain(`href="${href}">Start the first thread`);
  const opened = await render({ view: "discussions", from: search, compose: "1" });
  expect(opened).toMatch(/<details id="compose"[^>]*open=""/);
  expect(opened).toContain(`href="${href}">Draft return`);
});

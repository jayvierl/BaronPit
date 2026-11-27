import { PassThrough } from "node:stream";
import { createElement } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { activeConversations } from "../lib/home-conversations";
import { trendingChampions } from "../lib/player-insights";
import { visibleChampionRoomSlugs } from "../lib/rooms";
import type { PostView } from "../lib/post-types";
import { HomeDiscoveryRail } from "./home-discovery-rail";

vi.mock("./home-player-suggestions", () => ({ HomePlayerSuggestions: () => null }));
vi.mock("../lib/db", () => ({ dbAvailable: () => true }));
vi.mock("../lib/duo", () => ({ duoEnabled: () => false }));
vi.mock("../lib/player-insights", () => ({ trendingChampions: vi.fn(async () => [{ champion: "Nami", games: 4 }]) }));
vi.mock("../lib/rooms", () => ({ visibleChampionRoomSlugs: vi.fn(async () => ["champ-nami"]) }));

const day = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * day).toISOString();
const post = (id: number, overrides: Partial<PostView> = {}): PostView => ({
  id, authorId: 1, authorName: "Fixture", authorHue: 90, authorFlair: null,
  kind: "text", data: {}, body: `Lane discussion ${id}`, status: "visible", createdAt: daysAgo(2),
  commentCount: 1, roomId: null, roomSlug: null, roomName: null, reactions: {}, myReactions: [],
  pollResults: null, myVote: null, ...overrides,
});

function renderRail(posts: PostView[], activeTab: "everyone" | "following", joinedRooms: number[] = []) {
  return new Promise<string>((resolve, reject) => {
    const output = new PassThrough();
    output.setEncoding("utf8");
    let html = "";
    output.on("data", (chunk: string) => { html += chunk; });
    output.on("end", () => resolve(html));
    output.on("error", reject);
    const stream = renderToPipeableStream(createElement(HomeDiscoveryRail, {
      posts, activeTab, asOf: now, roomsRead: Promise.resolve([]), interestsRead: Promise.resolve(joinedRooms), patch: "16.23.1", viewerId: activeTab === "following" ? 42 : null,
    }), { onAllReady: () => stream.pipe(output), onError: reject });
  });
}

it("selects only visible, previewable activity from the passed feed and keeps reply totals", () => {
  const preview = "🧪".repeat(110);
  const visible = activeConversations([
    post(1, { body: "Wave  \n timing", commentCount: 7 }),
    post(2, { body: "wave timing", commentCount: 2, createdAt: daysAgo(3) }),
    post(3, { createdAt: daysAgo(10), lastReplyAt: daysAgo(1), body: preview }),
    post(4, { status: "held" }), post(5, { data: { briefing: true } }),
    post(6, { kind: "media" }), post(7, { body: "\u200b\n   " }),
    post(8, { createdAt: daysAgo(8) }), post(9, { commentCount: 0, createdAt: daysAgo(6) }),
    post(10, { createdAt: daysAgo(-1) }), post(11, { createdAt: daysAgo(14), lastReplyAt: daysAgo(-1) }),
    post(12, { createdAt: daysAgo(4) }), post(13, { createdAt: daysAgo(5) }),
  ], now);
  expect(visible.map(({ id, replies }) => [id, replies])).toEqual([[3, 1], [1, 7], [12, 1]]);
  expect(visible[0].preview).toBe("🧪".repeat(85) + "…");
  expect(visible[1].preview).toBe("Wave timing");
});

it("explains joined-room preference and keeps fresh cold-start conversations independent of engagement totals", async () => {
  const posts = [
    post(44, { roomId:7, roomName:"Laning", createdAt:daysAgo(5), commentCount:0 }),
    post(45, { createdAt:daysAgo(1), commentCount:0 }),
    post(46, { createdAt:daysAgo(2), commentCount:99, reactions:{GG:900} }),
    post(47, { roomId:7, roomName:"Laning",status:"held" }),
  ];
  expect(activeConversations(posts, now).map(post => post.id)).toEqual([45,46,44]);
  expect(activeConversations(posts, now, [7]).map(post => post.id)).toEqual([44,45,46]);
  const rail = await renderRail(posts, "following", [7]);
  expect(rail).toContain("Rooms you joined appear first");
  expect(rail.replaceAll("<!-- -->", "")).toContain("Joined room · Laning · No replies yet");
  expect(rail).toContain('href="/rooms#room-directory"');
});

it("renders active conversations or reads champion activity for the same rail slot", async () => {
  const active = await renderRail([post(28, { commentCount: 3 })], "following");
  expect(active).toContain("Active in your feed");
  expect(active).toContain('href="/post/28"');
  expect(active).toContain("3 replies");
  expect(active).not.toContain("Popular in recent champion pools");
  expect(trendingChampions).not.toHaveBeenCalled();
  expect(visibleChampionRoomSlugs).not.toHaveBeenCalled();

  const empty = await renderRail([post(30, { createdAt: daysAgo(15) })], "everyone");
  expect(empty).toContain("Popular in recent champion pools");
  expect(empty).toContain('href="/rooms/champ-nami"');
  expect(empty).not.toContain("Active conversations");
  expect(empty).not.toContain('href="/post/30"');
  expect(trendingChampions).toHaveBeenCalledOnce();
});

it("keeps champion activity usable when a room cannot be opened", async () => {
  vi.mocked(visibleChampionRoomSlugs).mockResolvedValueOnce([]);
  const html = await renderRail([], "everyone");
  expect(visibleChampionRoomSlugs).toHaveBeenLastCalledWith(["Nami"]);
  expect(html).toContain('href="/builds?champ=Nami"');
  expect(html.replaceAll("<!-- -->", "")).toContain("appearances · Builds");
  expect(html).not.toContain('href="/rooms/champ-nami"');
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProfilePage from "./page";

const { getCurrentUser, publicProfile, linkedPlayers, feedByAuthor, profileMatchDiscussions } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), publicProfile: vi.fn(), linkedPlayers: vi.fn(), feedByAuthor: vi.fn(), profileMatchDiscussions: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/riot", () => ({ currentPatch: async () => "16.23.1" }));
vi.mock("@/lib/player-insights", () => ({ publicProfile, linkedPlayers }));
vi.mock("@/lib/social", () => ({
  feedByAuthor, ENDORSE_KINDS: [], followCounts: async () => ({ followers: 0, following: 0 }),
  endorsementCounts: async () => ({}),
  dailyHighlight: (p: { snapshot: { matches: unknown[] } }) => p.snapshot.matches[0],
}));
vi.mock("@/lib/decisions", () => ({ profileMatchDiscussions }));

const player = { puuid: "fixture", platform: "na1", gameName: "Player", tagLine: "NA1", verified: false,
  snapshot: { games: 0, wins: 0, losses: 0, matches: [], champPool: [], roles: {} } };
const visit = (tab?: string, before?: string, from?: string, id = "42") =>
  ProfilePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ tab, before, from }) });

describe("profile tab queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
    publicProfile.mockResolvedValue({ id: 42, name: "Fixture player", hue: 1, createdAt: "2026-01-01" });
    linkedPlayers.mockResolvedValue([player]);
    feedByAuthor.mockResolvedValue([]);
    profileMatchDiscussions.mockResolvedValue({entries:[], next:null});
  });
  it("keeps missing or hidden profiles as 404 and avoids extra reads", async () => {
    publicProfile.mockResolvedValue(null);
    await expect(visit()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(linkedPlayers).not.toHaveBeenCalled();
  });
  it("keeps invalid ids as 404 even when session storage fails", async () => {
    getCurrentUser.mockRejectedValue(new Error("fixture storage is offline"));
    await expect(visit(undefined, undefined, undefined, "0x2a")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
  it("preserves the route for retry and never grants anonymous access after a session failure", async () => {
    getCurrentUser.mockRejectedValueOnce(new Error("fixture storage is offline"));
    const html = renderToStaticMarkup(await visit("discussions", "30", "/search?q=Player"));
    expect(html).toContain("Profile temporarily unavailable");
    expect(html).toContain('href="/u/42?tab=discussions&amp;before=30&amp;from=%2Fsearch%3Fq%3DPlayer"');
    expect(html).not.toContain("Fixture player");
    expect(html).not.toContain("fixture storage is offline");
    expect(publicProfile).not.toHaveBeenCalled();
    expect(linkedPlayers).not.toHaveBeenCalled();
  });
  it("offers the same retry when initial visibility or required content reads fail", async () => {
    publicProfile.mockRejectedValueOnce(new Error("fixture denied loading profile"));
    const unavailable = renderToStaticMarkup(await visit());
    expect(unavailable).toContain('href="/u/42"');
    expect(unavailable).toContain("Profile temporarily unavailable");
    expect(feedByAuthor).not.toHaveBeenCalled();

    linkedPlayers.mockRejectedValueOnce(new Error("fixture denied linked players"));
    expect(renderToStaticMarkup(await visit())).toBe(unavailable);
  });
  it("skips the post query when displaying linked players", async () => {
    const html = renderToStaticMarkup(await visit("players"));
    expect(html).toContain("Unverified");
    expect(html).toContain('class="chip"');
    expect(html).toContain('aria-label="League stats"');
    expect(html).toContain("Ranked Solo/Duo");
    expect(html).toContain("No recent public games available.");
    expect(linkedPlayers).toHaveBeenCalledWith(42, null, true);
    expect(feedByAuthor).not.toHaveBeenCalled();
  });
  it.each(["stats", "players"])("keeps an unlinked guest on the stats tab for ?tab=%s", async (tab) => {
    linkedPlayers.mockResolvedValue([]);
    const html = renderToStaticMarkup(await visit(tab));
    expect(html).toContain("No Riot account linked");
    expect(html).toMatch(/<a\b[^>]*href="\/player"[^>]*>Look up a Riot ID<\/a>/);
    expect(html).not.toContain("No posts yet");
    expect(feedByAuthor).not.toHaveBeenCalled();
  });
  it("keeps the profile post feed out of the public Replies tab", async () => {
    await visit("replies");
    expect(linkedPlayers).toHaveBeenCalledTimes(1);
    expect(feedByAuthor).not.toHaveBeenCalled();
  });
  it("loads the post feed on the default tab even with linked players", async () => {
    await visit();
    expect(feedByAuthor).toHaveBeenCalledWith(42, null, 20);
    expect(profileMatchDiscussions).not.toHaveBeenCalled();
  });
  it("keeps detailed League form collapsed and opens the exact highlight from a verified profile", async () => {
    const match = { matchId: "NA1_123", champion: "Nami", role: "UTILITY", queueId: 420,
      win: true, kills: 1, deaths: 2, assists: 11, cs: 23 };
    linkedPlayers.mockResolvedValue([{ ...player, verified: true, snapshot: { matches: [match], games: 1,
      wins: 1, losses: 0, kda: 6, champPool: [{ champion: "Nami", games: 1, wins: 1, kda: 6 }], roles: { UTILITY: 1 } } }]);
    const html = renderToStaticMarkup(await visit(undefined, undefined, "/search?q=Player"));
    expect(html).toMatch(/<details(?![^>]*\bopen\b)[^>]*><summary><span>League form<\/span>/);
    expect(html).toContain("1W · 0L in 1 recent public game");
    expect(html).toContain("Today’s highlight");
    expect(html).toContain('href="/player?platform=na1&amp;riotId=Player%23NA1&amp;match=NA1_123&amp;from=%2Fsearch%3Fq%3DPlayer#match-NA1_123"');
  });
  it("links an unverified community member’s published evidence without promoting their Riot claim", async () => {
    profileMatchDiscussions.mockResolvedValue({entries:[{postId:22,body:"How should I approach dragon?",topic:"Objective",
      matchContext:{champion:"Ashe",queueId:420,discussionKind:"perspective",matchHref:"/player?platform=na1&riotId=Rival%23NA1&match=NA1_23#match-NA1_23"}}],next:22});
    const html = renderToStaticMarkup(await visit("discussions","30","/search?q=Player"));
    expect(profileMatchDiscussions).toHaveBeenCalledWith(42,null,30);
    expect(feedByAuthor).not.toHaveBeenCalled();
    expect(html).toContain("How should I approach dragon?");
    expect(html).toContain('href="/post/22"');
    expect(html).toContain('href="/u/42?tab=discussions&amp;before=22&amp;from=%2Fsearch%3Fq%3DPlayer"');
    expect(html).toContain('href="/player?platform=na1&amp;riotId=Rival%23NA1&amp;match=NA1_23&amp;from=%2Fsearch%3Fq%3DPlayer#match-NA1_23"');
    expect(html).not.toContain('aria-label="League overview"');
  });
});

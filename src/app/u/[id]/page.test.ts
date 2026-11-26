import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProfilePage from "./page";

const { linkedPlayers, feedByAuthor } = vi.hoisted(() => ({
  linkedPlayers: vi.fn(), feedByAuthor: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/riot", () => ({ currentPatch: async () => "16.23.1" }));
vi.mock("@/lib/player-insights", () => ({
  publicProfile: async () => ({ id: 42, name: "Player", hue: 1, createdAt: "2026-01-01" }),
  linkedPlayers,
}));
vi.mock("@/lib/social", () => ({
  feedByAuthor, ENDORSE_KINDS: [], followCounts: async () => ({ followers: 0, following: 0 }),
  endorsementCounts: async () => ({}),
}));

const player = { puuid: "fixture", platform: "na1", gameName: "Player", tagLine: "NA1", verified: false };
const visit = (tab?: string) =>
  ProfilePage({ params: Promise.resolve({ id: "42" }), searchParams: Promise.resolve({ tab }) });

describe("profile tab queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    linkedPlayers.mockResolvedValue([player]);
    feedByAuthor.mockResolvedValue([]);
  });
  it("skips the post query when displaying linked players", async () => {
    await visit("players");
    expect(linkedPlayers).toHaveBeenCalledTimes(1);
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
  });
});

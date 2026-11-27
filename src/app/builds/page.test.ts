import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildsHref, buildThreadReturn } from "@/lib/build-sharing";
import { withSearchReturn } from "@/lib/search-scopes";
import BuildsPage from "./page";
import ComparePage from "./compare/page";
import ItemPage from "../items/[id]/page";

const fixture = vi.hoisted(() => ({ user: vi.fn(), room: vi.fn(), builds: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: fixture.user }));
vi.mock("@/lib/social", () => ({ buildFeed: fixture.builds }));
vi.mock("@/lib/rooms", () => ({ getRoom: fixture.room }));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/riot", () => ({
  currentPatch: async () => "16.23.1",
  confirmedPatch: async () => "16.23.1",
  championList: async () => [{ id: "Ashe", name: "Ashe" }, { id: "Nami", name: "Nami" }],
}));

describe("contextual build sharing", () => {
  beforeEach(() => {
    fixture.builds.mockResolvedValue([]);
    fixture.user.mockResolvedValue(null);
    fixture.room.mockResolvedValue(null);
  });
  it("hands off the champion room and draft through a real sign-in route without extra compose anchors", async () => {
    fixture.room.mockResolvedValue({ id: 42, championId: "Ashe", slug: "champ-ashe", name: "Ashe Mains" });
    const html = renderToStaticMarkup(await BuildsPage({ searchParams: Promise.resolve({ champ: "ashe", compose: "1", room: "1" }) }));
    expect(html).toContain("Ashe builds");
    expect(html).toContain("Posting in Ashe Mains");
    expect(html).toContain('href="/rooms/champ-ashe?feed=builds"');
    expect(html.match(/id="compose"/g)).toHaveLength(1);
    const signIn = html.match(/href="(\/signin\?next=[^"]+)"/)?.[1];
    expect(new URL(signIn!, "https://fixture.invalid").searchParams.get("next")).toBe(buildsHref({ champion: "Ashe", compose: true, room: true }));
    expect(fixture.room).toHaveBeenCalledWith("champ-ashe", undefined);
  });
  it("rejects an unavailable room rather than opening a composer in a different audience", async () => {
    const html = renderToStaticMarkup(await BuildsPage({ searchParams: Promise.resolve({ champ: "ashe", compose: "1", room: "1" }) }));
    expect(html).toContain("This champion room is unavailable");
    expect(html).not.toContain("<textarea");
  });
  it("seeds an existing item from its detail page and keeps the filtered collection useful", async () => {
    const item = renderToStaticMarkup(await ItemPage({ params: Promise.resolve({ id: "1001" }), searchParams: Promise.resolve({ from: "/search?q=Boots" }) }));
    expect(item).toContain('href="/search?q=Boots"');
    expect(item).toContain('href="/builds?item=1001&amp;compose=1&amp;from=%2Fsearch%3Fq%3DBoots#compose"');
    const from = "/search?q=Boots";
    const builds = renderToStaticMarkup(await BuildsPage({ searchParams: Promise.resolve({ item: "1001", compose: "1", from }) }));
    expect(builds).toContain("Starts with Boots in the first slot.");
    expect(builds).toContain(`href="${withSearchReturn("/items/1001", from)}">Back to item</a>`);
    expect(buildThreadReturn(withSearchReturn("/items/1001", from), "Ashe", [1001])).toEqual({
      href: withSearchReturn("/items/1001", from), label: "Back to item",
    });
    expect(fixture.builds).toHaveBeenCalledWith(null, { champion: undefined, item: 1001, offMeta: false });
  });
  it("allows only a matching room, item or build collection as a stable return", () => {
    expect(buildThreadReturn("/rooms/champ-ashe?feed=builds", "Ashe", [1001])).toMatchObject({ roomSlug: "champ-ashe", href: "/rooms/champ-ashe?feed=builds" });
    expect(buildThreadReturn("/items/1001?p=unsupported", "Ashe", [1001])).toMatchObject({ href: "/items/1001" });
    expect(buildThreadReturn("/items/3190", "Ashe", [1001])).toBeNull();
    expect(buildThreadReturn("/rooms/champ-nami?feed=builds", "Ashe", [1001])).toBeNull();
    expect(buildThreadReturn("//example.invalid/builds", "Ashe", [1001])).toBeNull();
  });
  it("returns from a build thread to the exact filtered collection and preserves its search origin", async () => {
    const from = "/search?scope=league&q=Boots";
    const collection = buildsHref({ champion: "Ashe", item: 1001, offMeta: true, from });
    fixture.builds.mockResolvedValue([{ id: 61, authorId: 12, authorName: "River", authorHue: 55, kind: "build",
      body: "Keep pace", status: "visible", data: { champion: "Ashe", items: [1001], offMeta: true, patch: "16.23.1" },
      reactions: {}, myReactions: [], commentCount: 0, createdAt: "2026-11-27T00:00:00Z" }]);
    const html = renderToStaticMarkup(await BuildsPage({ searchParams: Promise.resolve({ champ: "Ashe", item: "1001", offmeta: "1", from }) }));
    expect(html).toContain(`href="/post/61?${new URLSearchParams({ fromBuild: collection })}"`);
    expect(html).toContain(`href="${withSearchReturn("/items/1001", from)}"`);
    expect(html).toContain('name="from" value="/search?scope=league&amp;q=Boots"');
    expect(buildThreadReturn(collection, "Ashe", [1001])).toEqual({ href: collection, label: "Back to builds" });
    expect(buildThreadReturn("/builds?item=bad", "Ashe", [1001])).toBeNull();
    expect(buildThreadReturn("/builds?from=https%3A%2F%2Foutside.invalid", "Ashe", [1001])).toMatchObject({ href: "/builds" });
  });
  it("describes comparison data and its optional matchup note accurately", async () => {
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ item: "1001" }) }));
    expect(html).toContain("Compare shop costs and rune effects. Add a matchup as a note.");
    expect(html).toContain("Matchup note (optional)");
    expect(html).toContain("Start one path with this item, then add the rest of the build.");
  });
});

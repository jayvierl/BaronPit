import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildsHref, buildThreadReturn } from "@/lib/build-sharing";
import BuildsPage from "./page";
import ItemPage from "../items/[id]/page";

const fixture = vi.hoisted(() => ({ user: vi.fn(), room: vi.fn(), builds: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: fixture.user }));
vi.mock("@/lib/social", () => ({ buildFeed: fixture.builds }));
vi.mock("@/lib/rooms", () => ({ getRoom: fixture.room }));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/riot", () => ({
  currentPatch: async () => "16.23.1",
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
    expect(item).toContain('href="/builds?item=1001&amp;compose=1#compose"');
    const builds = renderToStaticMarkup(await BuildsPage({ searchParams: Promise.resolve({ item: "1001", compose: "1" }) }));
    expect(builds).toContain("Starts with Boots in the first slot.");
    expect(fixture.builds).toHaveBeenCalledWith(null, { champion: undefined, item: 1001, offMeta: false });
  });
  it("allows only a matching room, item or build collection as a stable return", () => {
    expect(buildThreadReturn("/rooms/champ-ashe?feed=builds", "Ashe", [1001])).toMatchObject({ roomSlug: "champ-ashe", href: "/rooms/champ-ashe?feed=builds" });
    expect(buildThreadReturn("/items/1001?p=unsupported", "Ashe", [1001])).toMatchObject({ href: "/items/1001" });
    expect(buildThreadReturn("/items/3190", "Ashe", [1001])).toBeNull();
    expect(buildThreadReturn("/rooms/champ-nami?feed=builds", "Ashe", [1001])).toBeNull();
    expect(buildThreadReturn("//example.invalid/builds", "Ashe", [1001])).toBeNull();
  });
});

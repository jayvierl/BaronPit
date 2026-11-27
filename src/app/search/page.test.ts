import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { searchHref, withSearchReturn } from "@/lib/search-scopes";
import type { PostView } from "@/lib/post-types";
import PostPage from "../post/[id]/page";
import SearchPage from "./page";

const fixture = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/riot", () => ({ currentPatch: async () => "16.23.1" }));
vi.mock("@/lib/social", () => ({
  searchAll: async () => ({ users: [], players: [], rooms: [], posts: [fixture.post()] }),
  getPost: async () => fixture.post(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}), usePathname: () => "/search" }));

it.each(["all", "players", "people", "league", "builds", "posts", "rooms"])(
  "renders the native %s search with name suggestions only in identity scopes", async scope => {
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ scope, region: "euw1" }) }));
    const form = html.match(/<form\b[^>]*role="search"[\s\S]*?<\/form>/)?.[0];
    expect(form).toBeDefined();
    expect(form).toContain('action="/search"');
    expect(form).toContain('name="q"');
    expect(form).toContain('name="region"');
    if (["all", "people", "players"].includes(scope)) expect(form).toContain('role="combobox"');
    else expect(form).not.toContain('role="combobox"');
    if (scope === "players") expect(form).toMatch(/<option[^>]*value="euw1"[^>]*selected=""/);
    if (scope === "league" || scope === "all") expect(html).toContain('href="/items"');
  },
);

it("carries the exact scoped search through a build result and the server-rendered thread back link", async () => {
  fixture.post.mockReturnValue({
    id: 41, authorId: 23, authorName: "Fixture", authorHue: 30, kind: "build", status: "visible",
    body: "For shorter trades", data: { champion: "Ashe", patch: "16.23.1", items: [1001] },
    reactions: {}, myReactions: [], commentCount: 0, createdAt: "2026-11-27T12:00:00Z",
  } satisfies Partial<PostView>);
  const q = "Écho #support";
  const from = searchHref("builds", q, "euw1");
  const search = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q, scope: "builds", region: "euw1" }) }));
  expect(search).toContain(`href="${withSearchReturn("/post/41", from)}"`);
  const html = renderToStaticMarkup(await PostPage({ params: Promise.resolve({ id: "41" }), searchParams: Promise.resolve({ from }) }));
  expect(html).toContain(`href="${from.replaceAll("&", "&amp;")}"`);
  expect(html).toContain('aria-label="Back to search"');

  const foreign = renderToStaticMarkup(await PostPage({ params: Promise.resolve({ id: "41" }),
    searchParams: Promise.resolve({ from: "//external.invalid/search?q=Ashe" }) }));
  expect(foreign).not.toContain('aria-label="Back to search"');
  expect(foreign).toContain('aria-label="Back to builds"');
});

it("opens a tagged discovery thread with readable champion and item links", async () => {
  fixture.post.mockReturnValue({
    id: 27, authorId: 23, authorName: "Fixture", authorHue: 30, kind: "text", status: "visible",
    body: "[[c:Jayce|Jayce]] with [[i:3031|Infinity Edge]]", data: {}, reactions: {}, myReactions: [],
    commentCount: 0, createdAt: "2026-11-27T12:00:00Z",
  } satisfies Partial<PostView>);
  const thread = renderToStaticMarkup(await PostPage({ params: Promise.resolve({ id: "27" }), searchParams: Promise.resolve({}) }));
  expect(thread).toContain('aria-label="Jayce, champion"');
  expect(thread).toContain('href="/champions/Jayce"');
  expect(thread).toContain('aria-label="Infinity Edge, item"');
  expect(thread).toContain('href="/items/3031"');
  expect(thread).not.toMatch(/\[\[[ci]:/);
});

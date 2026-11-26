import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PostCard } from "./post-card";
import { BARON_CALL_OPTIONS } from "../lib/poll";
import { RichBody } from "./ui";
import type { PostView } from "../lib/post-types";
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const base = {
  id: 1,
  authorId: 1,
  authorName: "River",
  authorHue: 90,
  authorFlair: null,
  body: "A lane swap",
  roomId: null,
  roomSlug: null,
  roomName: null,
  status: "visible",
  createdAt: "2026-11-26T00:00:00Z",
  reactions: {},
  myReactions: [],
  pollResults: null,
  myVote: null,
  commentCount: 0,
};
function render(kind: string, data: Record<string, unknown>, status = "visible") {
  return renderToStaticMarkup(
    createElement(PostCard, {
      post: { ...base, kind, data, status } as PostView,
      patch: "16.23.1",
      signedIn: false,
    }),
  );
}
describe("thread controls", () => {
  it("exposes named positive reactions, reply count, sharing, reporting and a permanent thread link", () => {
    const html = render("text",{});
    for (const label of ["Like, 0 likes","Fire, 0 reactions","Applause, 0 reactions","On target, 0 reactions",
      "Purple heart, 0 reactions","Good game, 0 reactions","Show replies, 0 replies","Share thread","Save or watch thread","Open thread by River"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain(">Report</button>");
    expect(html).toContain('aria-expanded="false" aria-controls="thread-replies-1"');
    expect(html).not.toContain("Loading replies");
  });
});
describe("Baron call ballots", () => {
  it("shows the call badge and its four answers only on a call poll", () => {
    const call = {call: true, options: BARON_CALL_OPTIONS};
    const ballot = render("poll", call);
    expect(ballot).toContain("Make the Call");
    expect(ballot).toContain("Reset &amp; farm");
    expect(render("text", call)).not.toContain("Make the Call");
    expect(render("poll", {options: BARON_CALL_OPTIONS})).not.toContain("Make the Call");
  });
});
describe("feed media privacy", () => {
  it("opens a released clip on the provider without an embed, preview or tracking parameters", () => {
    const html = render("clip", { url: "https://youtu.be/abcdefghijk?tracking=private" });
    expect(html).toContain('href="https://www.youtube.com/watch?v=abcdefghijk"');
    expect(html).not.toMatch(/iframe|tracking=|<video|<img/);
  });
  it("never exposes a held clip or a legacy upload in rendered cards", () => {
    expect(render("clip", { url: "https://youtu.be/abcdefghijk" }, "held")).not.toContain("abcdefghijk");
    expect(render("media", { url: "https://example.org/old-file.webm", mediaType: "video" })).not.toContain(
      "old-file",
    );
  });
  it("keeps video-provider requests out of unapproved or unrecognised links", () => {
    expect(render("clip", { url: "https://invalid.example/clip" })).not.toContain("invalid.example");
  });
  it("turns official patch briefing URLs and hashtags into working links", () => {
    const html = renderToStaticMarkup(
      createElement(RichBody, {
        body: "#mid https://www.leagueoflegends.com/en-us/news/tags/patch-notes/ https://example.org/post",
      }),
    );
    expect(html).toContain('href="/search?q=%23mid"');
    expect(html).toContain('href="https://www.leagueoflegends.com/en-us/news/tags/patch-notes/"');
    expect(html).not.toContain('href="https://example.org');
  });
});

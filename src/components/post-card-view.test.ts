import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PostCard } from "./post-card";
import { Composer } from "./composer";
import { BARON_CALL_OPTIONS } from "../lib/poll";
import { AVATAR_PATCH } from "../lib/avatar";
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
  it("keeps the post author's avatar distinct from the signed-in player's composer avatar", () => {
    const photo = {kind:"upload",id:"e154c2e1-f001-4324-98f7-d5435281c421",hash:"9e".repeat(32)} as const;
    const photoPath = "/api/profile-photo/" + photo.id + "?v=" + photo.hash;
    const viewer = {name:"Reader", hue:140, avatar:photo};
    const props = {
      post:{...base,kind:"text",data:{},authorAvatar:{kind:"champion",id:"Nami"} as const},
      signedIn:true,viewerId:2,viewerIdentity:viewer,threadPage:true,patch:"16.23.1",
    };
    const thread = renderToStaticMarkup(createElement(PostCard,props));
    expect(thread).toContain(`/champions/${AVATAR_PATCH}/Nami.webp`);
    expect(thread).toContain(photoPath);
    const composer = renderToStaticMarkup(createElement(Composer, {champions:[],patch:props.patch,viewerId:props.viewerId,viewerIdentity:viewer}));
    expect(composer).toContain(photoPath);
    expect(composer).toContain("2,000 character limit.");
    expect(renderToStaticMarkup(createElement(PostCard,{...props,signedIn:false}))).not.toContain(photoPath);
    expect(render("text",{})).not.toContain('class="avatar-art"');
  });

  it("links an author's public name to their community identity and verified rank to its Riot player", () => {
    const post = { ...base, kind: "text", data: {}, authorFlair: "Gold IV", authorStatsHref: "/player?platform=euw1&riotId=Un%20nom%23EUW" };
    const html = renderToStaticMarkup(createElement(PostCard, { post, patch: "16.23.1", signedIn: false }));
    expect(html).toContain('href="/u/1"');
    expect(html).toContain('href="/player?platform=euw1&amp;riotId=Un%20nom%23EUW"');
    expect(html).toContain('aria-label="View River’s verified Riot stats, Gold IV"');
    expect(render("text", {})).not.toContain('href="/player?');
  });

  it("renders initial thread replies in the first HTML and keeps unopened feed replies lazy", () => {
    const post: PostView = { ...base, kind: "text", data: {}, pollResults: null, myVote: null, commentCount: 1 };
    const comment = {
      id: 5, postId: post.id, authorId: 2, authorName: "Support", authorHue: 20, parentId: null,
      body: "Ward from the wave.", status: "visible", createdAt: post.createdAt, oneFix: false,
      reactions: {}, myReactions: [], replies: [],
    };
    const props = { post, patch: "16.23.1", signedIn: false, initialComments: [comment] };
    const detail = renderToStaticMarkup(createElement(PostCard, { ...props, threadPage: true }));
    expect(detail).toContain(comment.body);
    expect(detail).not.toContain("Loading replies");
    expect(renderToStaticMarkup(createElement(PostCard, props))).not.toContain(comment.body);
  });

  it("links a room in the conversation byline and shows the player’s take before the attached build", () => {
    const post: PostView = { ...base, kind: "build", data: { champion: "Ashe", offMeta: true },
      roomSlug: "champ-ashe", roomName: "Ashe", roomId: 8, pollResults: null, myVote: null };
    const html = renderToStaticMarkup(createElement(PostCard, { post, patch: "16.23.1", signedIn: false }));
    const room = html.indexOf('href="/rooms/champ-ashe"');
    const message = html.indexOf("A lane swap");
    expect(room).toBeGreaterThan(0);
    expect(message).toBeGreaterThan(room);
    expect(html.indexOf("Ashe build")).toBeGreaterThan(message);
  });

  it("labels the server-designated patch briefing in feed and thread cards", () => {
    const briefing = { ...base, kind: "text", data: { briefing: true, patch: "16.23.1" } };
    for (const threadPage of [false, true]) {
      const html = renderToStaticMarkup(createElement(PostCard, {
        post: briefing, patch: "16.23.1", signedIn: false, threadPage,
      }));
      expect(html).toContain("Automated patch update");
    }
    expect(render("text", {})).not.toContain("Automated patch update");
  });

  it("exposes named positive reactions, reply count, sharing, reporting and a permanent thread link", () => {
    const html = render("text",{});
    for (const label of ["Like, 0 likes","Fire, 0 reactions","Applause, 0 reactions","On target, 0 reactions",
      "Purple heart, 0 reactions","Good game, 0 reactions","Show replies, 0 replies","Share thread","Save and manage thread notifications","Open thread by River"]) {
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

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { CommentView } from "../lib/post-types";
import { CommentSection } from "./comment-section";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

function comment(id: number, replies: CommentView[] = []): CommentView {
  return {
    id, replies, postId: 40, authorId: id, authorName: `Player ${id}`, authorHue: 1,
    parentId: null, body: "Fixture reply", status: "visible", createdAt: "2026-11-25T00:00:00.000Z",
    oneFix: false, reactions: {}, myReactions: [],
  };
}

it("renders native expanded branches, counting only the descendants in the viewer's tree", () => {
  const roots = [comment(10, [comment(11, [comment(12)]), comment(13)]), comment(14)];
  const html = renderToStaticMarkup(createElement(CommentSection, { postId: 40, initialComments: roots, signedIn: false }));
  expect(html).toMatch(/<details[^>]* open=""><summary aria-label="3 replies under Player 10’s comment">3 replies<\/summary>/);
  expect(html).toContain('aria-label="1 reply under Player 11’s comment"');
  expect(html).not.toContain('0 replies under');
  expect(html).toContain('id="reply-12"');
  expect(html).toContain('/post/40#reply-12');
});

it("does not offer a branch toggle for a conversation containing only roots", () => {
  const html = renderToStaticMarkup(createElement(CommentSection, { postId: 40, initialComments: [comment(10)], signedIn: false }));
  expect(html).not.toMatch(/aria-label="\d+ repl(?:y|ies) under/);
  expect(html).toContain('aria-label="Reply to Player 10"');
});

it("uses native fragment links in a thread and focuses the reply row independently of its descendants", () => {
  const html = renderToStaticMarkup(createElement(CommentSection, {
    postId: 40, initialComments: [comment(10, [comment(11)])], signedIn: false, threadPage: true,
  }));
  expect(html).toMatch(/<div id="reply-10" class="comment-row [^"]+" tabindex="-1">/);
  expect(html).toContain('href="#reply-11"');
  expect(html).not.toContain('href="/post/40#reply-11"');
});

it.each([false, true])("renders an editable private guest draft without a native submit before hydration (question=%s)", decisionQuestion => {
  const html = renderToStaticMarkup(createElement(CommentSection, {
    postId: 40, initialComments: [], signedIn: false, decisionQuestion,
  }));
  const textbox = html.match(/<(?:input|textarea)\b[^>]*aria-label="Your reply"[^>]*>/)?.[0];
  expect(textbox).toBeTruthy();
  expect(textbox).not.toMatch(/\s(?:disabled|name|value)=/);
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled="">Sign in to reply<\/button>/);
  expect(html).toContain("Copy your reply before signing in.");
  expect(html).toContain('href="/signin?next=%2Fpost%2F40%23replies-40"');
});

it("names the reply author's avatar link using the monogram that remains behind the artwork", () => {
  const reply = { ...comment(10), authorName: "top lane", authorAvatar: { kind: "champion", id: "Nami" } as const };
  const html = renderToStaticMarkup(createElement(CommentSection, { postId: 40, initialComments: [reply], signedIn: false }));
  const avatar = html.match(/<a\b[^>]*aria-label="TL, top lane’s profile"[^>]*><span\b[^>]*>TL[\s\S]*?<\/a>/)?.[0];
  expect(avatar).toContain('href="/u/10"');
  expect(avatar).toContain("/Nami.webp");
});

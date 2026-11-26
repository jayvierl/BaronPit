import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { GuestPostDraft } from "./guest-draft";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

it.each([
  { destination: "/#compose", label: "Your post", anchorId: null },
  { destination: "/rooms/general?feed=builds#compose", label: "Post in The Baron Pit", roomId: 1 },
])("lets guests type safely before hydration and sign in without scripts from $destination", props => {
  const html = renderToStaticMarkup(createElement(GuestPostDraft, props));
  const textarea = html.match(/<textarea\b[^>]*>/)?.[0];
  expect(textarea).toBeDefined();
  expect(textarea).not.toMatch(/\b(name|disabled|readonly)=/i);
  expect(html).not.toMatch(/<form\b|type="submit"/);
  expect(html).toMatch(/<button\b[^>]*type="button"[^>]*disabled=""[^>]*>Sign in to post<\/button>/);
  expect(html).not.toContain("Your draft stays in this browser during sign-in.");

  const href = html.match(/<noscript>[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>Open sign-in<\/a>/)?.[1];
  expect(href).toBeDefined();
  const signIn = new URL(href!, "https://example.invalid");
  expect(signIn.pathname).toBe("/signin");
  expect([...signIn.searchParams.entries()]).toEqual([["next", props.destination]]);
});

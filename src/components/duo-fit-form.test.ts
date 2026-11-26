import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DuoFitForm } from "./duo-fit-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

it.each(["/lfg#duo-plan", "/lfg?view=all#duo-plan"])("keeps the unhydrated submission safe and a native sign-in link for %s", returnTo => {
  const markup = renderToStaticMarkup(createElement(DuoFitForm, { saved: null, signedIn: false, returnTo }));
  const form = markup.match(/<form\b[\s\S]*?<\/form>/)?.[0] ?? "";
  expect(form).toMatch(/<button\b[^>]*disabled=""[^>]*>Sign in to save my plan<\/button>/);
  expect(form).toContain('action="/signin"');
  expect([...form.matchAll(/\bname="([^"]+)"/g)].map(match => match[1])).toEqual(["next"]);
  expect(form).toContain(`name="next" value="${returnTo}"`);
  expect(markup).toContain(`<noscript><p><a href="/signin?next=${encodeURIComponent(returnTo)}">Sign in to continue</a>. Enter your preferences again after signing in.</p></noscript>`);
});

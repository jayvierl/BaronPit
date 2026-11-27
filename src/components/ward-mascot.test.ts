import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import MissingPage from "../app/not-found";
import PageError from "../app/error";
import { WardEmptyState, WardMascot } from "./ward-mascot";

it("keeps empty states to the description and one action with a 72-pixel mascot", () => {
  const html = renderToStaticMarkup(createElement(WardEmptyState, {
    text: "No threads in this room yet.", action: createElement("a", { href: "#compose" }, "Start the first thread"),
  }));
  const img = html.match(/<img\b[^>]*>/)?.[0];
  for (const attribute of ['alt="The Baron Pit ward mascot"', 'width="72"', 'height="72"', 'src="/mascot.png"']) expect(img).toContain(attribute);
  expect(html.match(/<a\b/g)).toHaveLength(1);
});

it("uses the compact crop and gives missing or failed pages one home action", () => {
  expect(renderToStaticMarkup(createElement(WardMascot, { size: 36, compact: true }))).toContain('/mascot-avatar.png');
  for (const element of [createElement(MissingPage), createElement(PageError, { reset() {} })]) {
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-page-unavailable="true"');
    expect(html).toContain("The pit is quiet here.</h1>");
    expect(html.match(/<a\b[^>]*>/g)).toEqual(['<a href="/">']);
  }
});

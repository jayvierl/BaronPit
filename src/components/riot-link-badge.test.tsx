import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RiotLinkBadge } from "./riot-link-badge";

it("renders a Baron violet Verified badge for a proven link", () => {
  const html = renderToStaticMarkup(createElement(RiotLinkBadge, { verified: true }));
  expect(html).toContain("Verified");
  expect(html).not.toContain("Unverified");
  expect(html).toContain("riot-verified");
});

it("renders a muted Unverified badge for a claimed link", () => {
  const html = renderToStaticMarkup(createElement(RiotLinkBadge, { verified: false }));
  expect(html).toContain("Unverified");
  expect(html).not.toContain("riot-verified");
});

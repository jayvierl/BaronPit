import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReviewHero } from "./review-hero";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const platforms = [
  { id: "na1", label: "North America" },
  { id: "euw1", label: "EU West" },
];
const example = createElement("p", null, "EXAMPLE CARD BODY");

describe("ReviewHero", () => {
  it("renders the example already open when the deep link asked for it", () => {
    // The homepage passes initialExampleOpen for /?example=1#example-review,
    // so a pasted deep link lands on the expanded card (and its anchor).
    const html = renderToStaticMarkup(createElement(ReviewHero, { platforms, initialExampleOpen: true }, example));
    expect(html).toContain("EXAMPLE CARD BODY");
    expect(html).toContain('aria-expanded="true"');
  });

  it("keeps the example hidden until the toggle is used", () => {
    const html = renderToStaticMarkup(createElement(ReviewHero, { platforms }, example));
    expect(html).not.toContain("EXAMPLE CARD BODY");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("See an example");
  });

  it("keeps the lookup a plain GET form to /player with review=1", () => {
    const html = renderToStaticMarkup(createElement(ReviewHero, { platforms }));
    expect(html).toContain('action="/player"');
    expect(html).toContain('method="get"');
    expect(html).toContain('name="review"');
    expect(html).toContain('name="riotId"');
    expect(html).toContain('name="platform"');
    expect(html).toContain("Look up a player");
    expect(html).toContain("Review your last game.");
  });
});

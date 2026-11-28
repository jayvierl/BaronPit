import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchReviewCard } from "./match-review-card";
import { EXAMPLE_REVIEW_EYEBROW, EXAMPLE_REVIEW_HREF, EXAMPLE_REVIEW_MATCH, EXAMPLE_REVIEW_QUESTION } from "../lib/match-review";
import type { MatchSummary } from "../lib/pure";

const base: MatchSummary = {
  matchId: "NA1_1", champion: "Ashe", win: true, kills: 7, deaths: 2, assists: 6, cs: 180,
  durationSec: 1800, queueId: 420, role: "BOTTOM", playedAt: 1000, items: [],
};

function render(props: Parameters<typeof MatchReviewCard>[0]) {
  return renderToStaticMarkup(createElement(MatchReviewCard, props));
}

describe("MatchReviewCard", () => {
  it("shows champion, result, stored rating, one standout and the question", () => {
    const html = render({
      match: { ...base, performanceRating: 8.3, killParticipation: 0.65 },
      discussHref: "/questions/new?platform=na1&discuss=1",
      sharePath: "/player?platform=na1&riotId=Fixture%23NA1&match=NA1_1#match-NA1_1",
    });
    expect(html).toContain("Ashe · Bot");
    expect(html).toContain("Victory");
    expect(html).toContain("7 / 2 / 6 K/D/A");
    expect(html).toContain("8.3/10 rating");
    expect(html).toContain("65%");
    expect(html).toContain("kill participation");
    expect(html).toContain("What would you review first?");
    expect(html).toContain('href="/questions/new?platform=na1&amp;discuss=1"');
    expect(html).toContain("Discuss this match");
    expect(html).toContain("Copy match link");
  });

  it("omits the rating for an unrated game instead of inventing one", () => {
    const html = render({ match: base });
    expect(html).not.toContain("/10 rating");
    expect(html).not.toContain("Not rated");
  });

  it("omits the standout when nothing standout-worthy was stored", () => {
    const html = render({ match: base });
    expect(html).not.toContain("of team champion damage");
    expect(html).not.toContain("kill participation");
    expect(html).not.toContain("vision score");
  });

  it("prefers the stored damage share and labels it as team champion damage", () => {
    const html = render({ match: { ...base, damageVersion: 1, teamDamageShare: 0.35, killParticipation: 0.9 } });
    expect(html).toContain("35%");
    expect(html).toContain("of team champion damage");
  });

  it("renders the labeled homepage example with the concept's exact line", () => {
    const html = render({
      match: EXAMPLE_REVIEW_MATCH, eyebrow: EXAMPLE_REVIEW_EYEBROW, question: EXAMPLE_REVIEW_QUESTION,
      discussHref: "/signin?next=%2Fquestions", discussLabel: "See live discussions ↗",
      sharePath: EXAMPLE_REVIEW_HREF, shareLabel: "Copy example link",
      viewHref: EXAMPLE_REVIEW_HREF, viewLabel: "Open this example",
    });
    expect(html).toContain("EXAMPLE REVIEW · RANKED SOLO/DUO");
    expect(html).toContain("Annie · Mid");
    expect(html).toContain("Defeat");
    expect(html).toContain("12 / 8 / 2 K/D/A");
    expect(html).toContain("6.5/10 rating");
    expect(html).toContain("35%");
    expect(html).toContain("of team champion damage");
    expect(html).toContain("Positioning, vision, or how the team fights started?");
    // Every example action names what it actually does: the discussion
    // action leads to the live discussions (via sign-in), the copy action
    // copies the example's own deep link, and the view link opens that same
    // deep link — nothing claims a match page or a draft exists.
    expect(html).toContain("See live discussions");
    expect(html).toContain("Copy example link");
    expect(html).toContain(`href="${EXAMPLE_REVIEW_HREF}"`);
    expect(html).toContain("Open this example");
    expect(html).not.toContain("View the example match");
    expect(html).not.toContain("discussion draft");
    expect(EXAMPLE_REVIEW_HREF).toBe("/?example=1#example-review");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EARLY_SURRENDER_REASON } from "@/lib/match-performance";
import type { MatchSummary } from "@/lib/pure";
import { RecentResults } from "./player-overview";

function game(id: number, overrides: Partial<MatchSummary> = {}): MatchSummary {
  return { matchId: `NA1_${id}`, champion: "Ashe", win: id % 2 === 0, kills: 1, deaths: 1, assists: 1, cs: 100,
    durationSec: 1800, queueId: 420, role: "BOTTOM", playedAt: id, items: [], ...overrides };
}

it("shows the last ten completed games with the actual count and record", () => {
  const matches = Array.from({ length: 14 }, (_, i) => game(i + 1));
  const html = renderToStaticMarkup(createElement(RecentResults, { matches, historyPath: "/player?x=1" }));
  expect(html).toContain("Last 10 games · 5W–5L");
  expect(html.match(/data-result=/g)).toHaveLength(10);
});

it("labels a shorter sample with its real count instead of padding to ten", () => {
  const html = renderToStaticMarkup(createElement(RecentResults, {
    matches: [game(2), game(4), game(5)], historyPath: "",
  }));
  expect(html).toContain("Last 3 games · 2W–1L");
});

it("skips flagged remakes when taking the last ten completed games", () => {
  const matches = [
    game(30, { ratingReason: EARLY_SURRENDER_REASON, win: false }),
    ...Array.from({ length: 10 }, (_, i) => game(i + 1, { win: true })),
  ];
  const html = renderToStaticMarkup(createElement(RecentResults, { matches, historyPath: "" }));
  expect(html).toContain("Last 10 games · 10W–0L");
});

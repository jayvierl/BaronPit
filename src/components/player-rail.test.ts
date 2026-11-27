import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { buildPlayerAnalytics } from "@/lib/player-analytics";
import type { MatchSummary } from "@/lib/pure";
import { PlayerRail } from "./player-rail";

const now = Date.parse("2026-11-27T00:00:00Z");

function game(id: number, overrides: Partial<MatchSummary> = {}): MatchSummary {
  return { matchId: `NA1_${id}`, champion: "Ahri", win: true, kills: 4, deaths: 2, assists: 8, cs: 160,
    durationSec: 1800, queueId: 420, role: "MIDDLE", playedAt: now - id * 3_600_000, items: [], ...overrides };
}

it("renders the activity grid with the stored range labelled, never a claimed window", () => {
  const analytics = buildPlayerAnalytics([
    game(1, { playedAt: Date.parse("2026-11-26T15:14:00Z") }),
    game(2, { playedAt: Date.parse("2026-11-26T18:55:00Z"), win: false }),
    game(3, { playedAt: Date.parse("2026-11-24T00:03:00Z"), win: false, durationSec: 3600 }),
  ], now);
  const html = renderToStaticMarkup(createElement(PlayerRail, { analytics }));
  expect(html).toContain("Recent activity");
  expect(html).toContain("Stored games");
  expect(html).toContain("Nov 24, 2026");
  expect(html).toContain("Nov 26, 2026");
  expect(html).not.toContain("120");
  // One win/loss-mixed day, one loss day, one empty day between them.
  expect(html).toContain('data-result="mixed"');
  expect(html).toContain('data-result="loss"');
  expect(html).toContain("3 games played");
  expect(html).toContain("2 hours played");
  expect(html).toContain('title="Nov 26, 2026 · 2 games · 1W–1L"');
});

it("renders top roles from the same sample with a wins/losses split and win rate", () => {
  const analytics = buildPlayerAnalytics([
    game(1), game(2, { win: false }), game(3), game(4, { role: "UTILITY", champion: "Nami" }),
  ], now);
  const html = renderToStaticMarkup(createElement(PlayerRail, { analytics }));
  expect(html).toContain("Top roles");
  expect(html).toContain("Mid");
  expect(html).toContain("Preferred");
  expect(html).toContain("3 games · 2W–1L · 67% WR");
  expect(html).toContain("Support");
  expect(html).toContain("1 game · 1W–0L · 100% WR");
});

it("renders nothing when the sample has neither dated games nor recorded roles", () => {
  const analytics = buildPlayerAnalytics([game(1, { playedAt: 0, role: "" })], now);
  expect(renderToStaticMarkup(createElement(PlayerRail, { analytics }))).toBe("");
});

it("keeps the activity section with an honest note when dates are missing but roles exist", () => {
  const analytics = buildPlayerAnalytics([game(1, { playedAt: 0 })], now);
  const html = renderToStaticMarkup(createElement(PlayerRail, { analytics }));
  expect(html).toContain("Match dates are unavailable in this sample.");
  expect(html).toContain("Top roles");
});

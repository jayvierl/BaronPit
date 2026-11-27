import { expect, it } from "vitest";
import { groupMatchesByDay } from "./match-day-groups";
import { EARLY_SURRENDER_REASON } from "./match-performance";
import type { MatchSummary } from "./pure";

// Wednesday Nov 26, 2026, midday UTC.
const now = Date.UTC(2026, 10, 26, 12, 0, 0);
const hour = 3_600_000;

function game(id: number, playedAt: number, overrides: Partial<MatchSummary> = {}): MatchSummary {
  return { matchId: `NA1_${id}`, champion: "Ashe", win: true, kills: 5, deaths: 3, assists: 5, cs: 210,
    durationSec: 1800, queueId: 420, role: "BOTTOM", playedAt, items: [], ...overrides };
}

it("groups consecutive matches by UTC day with relative labels", () => {
  const groups = groupMatchesByDay([
    game(1, now - hour), game(2, now - 2 * hour, { win: false }),
    game(3, now - 26 * hour), game(4, now - 30 * hour),
    game(5, now - 4 * 24 * hour),
  ], now);
  expect(groups.map(group => group.label)).toEqual(["Today", "Yesterday", "Sunday, Nov 22, 2026"]);
  expect(groups.map(group => group.matches.length)).toEqual([2, 2, 1]);
});

it("counts wins, losses and win rate per group", () => {
  const [today] = groupMatchesByDay([
    game(1, now - hour), game(2, now - 2 * hour), game(3, now - 3 * hour, { win: false }), game(4, now - 4 * hour, { win: false }),
  ], now);
  expect(today).toMatchObject({ wins: 2, losses: 2, winRate: 50 });
});

it("keeps remakes listed in their group but out of the record", () => {
  const [today] = groupMatchesByDay([
    game(1, now - hour),
    game(2, now - 2 * hour, { win: false, ratingReason: EARLY_SURRENDER_REASON }),
    game(3, now - 3 * hour, { ratingReason: EARLY_SURRENDER_REASON }),
  ], now);
  expect(today.matches).toHaveLength(3);
  expect(today).toMatchObject({ wins: 1, losses: 0, winRate: 100 });
});

it("reports a null win rate when every game in the group is a remake", () => {
  const [today] = groupMatchesByDay([
    game(1, now - hour, { ratingReason: EARLY_SURRENDER_REASON }),
  ], now);
  expect(today.winRate).toBeNull();
  expect(today.wins + today.losses).toBe(0);
});

it("buckets undated matches under Date unavailable without counting them as a day", () => {
  const groups = groupMatchesByDay([game(1, 0), game(2, now - hour)], now);
  expect(groups[0].label).toBe("Date unavailable");
  expect(groups[1].label).toBe("Today");
});

it("returns no groups for an empty list", () => {
  expect(groupMatchesByDay([], now)).toEqual([]);
});

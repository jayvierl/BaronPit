import { expect, it } from "vitest";
import { currentWinStreak } from "./current-win-streak";

const now = Date.parse("2026-11-26T19:00:00Z");
const fetchedAt = new Date(now - 30_000).toISOString();
const game = (id: number, win = true) => ({ matchId: `NA1_${id}`, playedAt: now - (10 + id) * 60_000, win });

it("counts only the current unique sequence of at least three wins", () => {
  expect(currentWinStreak({ matches: [game(1),game(1),game(2),game(3),game(4,false),game(5)] }, fetchedAt, now)).toBe(3);
  expect(currentWinStreak({ matches: [game(1),game(1),game(2),game(3,false)] }, fetchedAt, now)).toBeNull();
  expect(currentWinStreak({ matches: [game(1,false),game(2),game(3),game(4)] }, fetchedAt, now)).toBeNull();
});

it("suppresses stale, ambiguous and out-of-order evidence", () => {
  const wins = [game(1),game(2),game(3)];
  expect(currentWinStreak({ matches: wins }, fetchedAt, now + 10 * 60_000)).toBeNull();
  expect(currentWinStreak({ matches: [game(2),game(1),game(3)] }, fetchedAt, now)).toBeNull();
  expect(currentWinStreak({ matches: [game(1),game(1,false),game(2),game(3)] }, fetchedAt, now)).toBeNull();
  expect(currentWinStreak({ matches: [game(1),{ matchId: "NA1_2" },game(3),game(4)] }, fetchedAt, now)).toBeNull();
});

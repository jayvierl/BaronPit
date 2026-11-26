import { describe, expect, it } from "vitest";
import { earnedBadges, formReads, samePatch, summarize, type MatchSummary } from "./pure";

function match(partial: Partial<MatchSummary>): MatchSummary {
  return {
    matchId: "m", champion: "Ashe", win: true, kills: 5, deaths: 2, assists: 8,
    cs: 180, durationSec: 1800, queueId: 420, role: "BOTTOM", playedAt: 0, items: [],
    gold: 12000, teamGold: 55000,
    teammates: [{ champion: "Lux", name: "Duo" }],
    ...partial,
  };
}

describe("summarize", () => {
  it("aggregates wins and KDA", () => {
    const s = summarize([match({}), match({ win: false, kills: 1, deaths: 4, assists: 2 })]);
    expect(s.games).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.kda).toBeCloseTo((6 + 10) / 6, 2);
  });
});

describe("samePatch", () => {
  it("compares major.minor only", () => {
    expect(samePatch("16.23.1", "16.23")).toBe(true);
    expect(samePatch("16.23.1", "16.24.1")).toBe(false);
  });
});

describe("earnedBadges", () => {
  it("awards Baron caller when the team secured Baron in 5+ games", () => {
    const games = Array.from({ length: 6 }, () => match({ baron: true, kills: 2, deaths: 4, assists: 3 }));
    const badges = earnedBadges(summarize(games));
    expect(badges.some((b) => b.includes("Baron caller · 6 secured"))).toBe(true);
  });
  it("awards one-trick and sharpshooter from a dominant snapshot", () => {
    const games = Array.from({ length: 6 }, () => match({ kills: 9, deaths: 1, assists: 9 }));
    const badges = earnedBadges(summarize(games));
    expect(badges.some((b) => b.includes("one-trick"))).toBe(true);
    expect(badges.some((b) => b.includes("Sharpshooter"))).toBe(true);
  });
  it("awards nothing for a thin snapshot", () => {
    expect(earnedBadges(summarize([match({}), match({})]))).toEqual([]);
  });
});

describe("formReads", () => {
  it("returns nothing for an empty snapshot", () => {
    expect(formReads(summarize([]))).toEqual([]);
  });

  it("reads recent form and farming for a carry", () => {
    const s = summarize([
      match({}), match({}), match({ win: false }),
      match({ kills: 0, deaths: 5, assists: 1 }), match({ kills: 0, deaths: 5, assists: 1 }),
    ]);
    const reads = formReads(s);
    expect(reads[0].label).toBe("Recent form");
    expect(reads[0].value).toContain("2W");
    expect(reads.some((r) => r.label === "Farming" && r.value.includes("6.0"))).toBe(true);
    expect(reads.some((r) => r.label === "Gold share")).toBe(true);
  });

  it("reads playmaking instead of farming for supports", () => {
    const s = summarize([match({ role: "UTILITY", assists: 14 }), match({ role: "UTILITY", assists: 12 })]);
    const reads = formReads(s);
    expect(reads.some((r) => r.label === "Playmaking")).toBe(true);
    expect(reads.some((r) => r.label === "Farming")).toBe(false);
  });
});

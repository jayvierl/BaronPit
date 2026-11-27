import { expect, it } from "vitest";
import {
  buildPerformanceIndex, duoSynergy, formCurve, gameScalars, percentileOf, personalBests, teammateRecords,
  type PoolGame,
} from "./performance-index";
import type { MatchSummary } from "./pure";

function game(id: number, overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: `NA1_${id}`, champion: "Ahri", win: true, kills: 4, deaths: 2, assists: 8, cs: 180,
    durationSec: 1800, queueId: 420, role: "MIDDLE", playedAt: 1_700_000_000_000 - id * 1000, items: [],
    killParticipation: 0.5, vision: 30, ...overrides,
  };
}

function poolGame(playerKey: string, overrides: Partial<PoolGame> = {}): PoolGame {
  return { playerKey, role: "MIDDLE", csPerMin: 6, killParticipation: 0.5, kda: 3, visionPerMin: 1, rating: null, ...overrides };
}

/** 40 same-role pool games whose averages sit below the strong player fixture. */
function midPool(): PoolGame[] {
  return Array.from({ length: 40 }, (_, i) => poolGame(`pool-${i % 8}`, {
    csPerMin: 4 + (i % 5), killParticipation: 0.3 + (i % 5) * 0.08, kda: 1.5 + (i % 5) * 0.5, visionPerMin: 0.5 + (i % 5) * 0.2,
  }));
}

it("computes percentiles with ties counting half", () => {
  expect(percentileOf(82, Array.from({ length: 100 }, (_, i) => i + 1))).toBe(82);
  expect(percentileOf(50, [50, 50, 50])).toBe(50);
  expect(percentileOf(1, [2, 3])).toBe(0);
  expect(percentileOf(9, [])).toBe(0);
});

it("extracts per-game scalars and rejects unmeasured values", () => {
  expect(gameScalars(game(1))).toEqual({ csPerMin: 6, killParticipation: 0.5, kda: 6, visionPerMin: 1, rating: null });
  expect(gameScalars(game(1, { killParticipation: 1.4, vision: undefined, performanceRating: 11 })))
    .toEqual({ csPerMin: 6, killParticipation: null, kda: 6, visionPerMin: null, rating: null });
  expect(gameScalars(game(1, { performanceRating: 7.5 })).rating).toBe(7.5);
});

it("builds a four-dimension index against the same-role pool, with no Damage dimension", () => {
  const player = Array.from({ length: 6 }, (_, i) => game(i + 1, { cs: 300, killParticipation: 0.75, vision: 60 }));
  const index = buildPerformanceIndex(player, midPool());
  expect(index).not.toBeNull();
  expect(index!.games).toBe(6);
  expect(index!.roleLabel).toBe("Mid");
  expect(index!.dimensions.map(d => d.key).sort()).toEqual(["aggression", "farming", "survival", "vision"]);
  const farming = index!.dimensions.find(d => d.key === "farming")!;
  expect(farming.playerAvg).toBe(10);
  expect(farming.poolAvg).toBeCloseTo(6);
  expect(farming.percentile).toBe(100);
  expect(farming.poolScope).toBe("role");
  expect(index!.score).toBeGreaterThan(80);
  expect(index!.strengths).toHaveLength(2);
  expect(index!.focus).toHaveLength(2);
  expect(index!.strengths[0].sentence).toContain("CS/min");
  expect(index!.strengths[0].sentence).toContain("Mid games in the Baron Pit sample");
});

it("returns null below five games or when the pool cannot support four dimensions", () => {
  const player = Array.from({ length: 6 }, (_, i) => game(i + 1));
  expect(buildPerformanceIndex(player.slice(0, 4), midPool())).toBeNull();
  expect(buildPerformanceIndex(player, midPool().slice(0, 20))).toBeNull();
  expect(buildPerformanceIndex(player, [])).toBeNull();
});

it("falls back to the all-roles pool when the player's role pool is thin", () => {
  const player = Array.from({ length: 5 }, (_, i) => game(i + 1, { role: "TOP", cs: 300 }));
  const index = buildPerformanceIndex(player, midPool());
  expect(index).not.toBeNull();
  expect(index!.roleLabel).toBe("Top");
  expect(index!.dimensions.every(d => d.poolScope === "all")).toBe(true);
  expect(index!.strengths[0].sentence).toContain("games in the Baron Pit sample");
});

it("scores consistency from rating spread against other sampled players", () => {
  // Perfectly steady ratings (spread 0) while every other dimension sits
  // mid-pool, so Consistency is the outright top strength.
  const player = Array.from({ length: 6 }, (_, i) => game(i + 1, { deaths: 4, performanceRating: 7 }));
  const volatile = Array.from({ length: 10 }, (_, p) =>
    Array.from({ length: 6 }, (_, g) => poolGame(`volatile-${p}`, { rating: g % 2 ? 3 : 9 }))).flat();
  const index = buildPerformanceIndex(player, [...midPool(), ...volatile]);
  const consistency = index!.dimensions.find(d => d.key === "consistency");
  expect(consistency).toBeDefined();
  expect(consistency!.percentile).toBe(100);
  expect(consistency!.playerAvg).toBe(0);
  expect(index!.strengths[0].key).toBe("consistency");
  expect(index!.strengths[0].sentence).toContain("steadier than 100%");
});

it("omits consistency when the player has too few rated games", () => {
  const player = Array.from({ length: 6 }, (_, i) => game(i + 1, { performanceRating: i < 3 ? 7 : undefined }));
  const index = buildPerformanceIndex(player, midPool());
  expect(index!.dimensions.find(d => d.key === "consistency")).toBeUndefined();
});

it("collects personal bests with the five-minute farm floor and the KDA games gate", () => {
  const matches = [
    game(1, { champion: "Ahri", performanceRating: 6.2, kills: 3, cs: 400, durationSec: 240 }),
    game(2, { champion: "Zed", performanceRating: 9.4, kills: 11, cs: 200, durationSec: 1500, win: false }),
    game(3, { champion: "Ahri", kills: 5, deaths: 0, assists: 7, cs: 270, durationSec: 1800 }),
    game(4, { champion: "Lux", kills: 2, cs: 150, durationSec: 1800 }),
    game(5, { champion: "Lux", kills: 1, cs: 140, durationSec: 1800 }),
  ];
  const bests = personalBests(matches);
  expect(bests.find(b => b.key === "rating")).toMatchObject({ value: "9.4", champion: "Zed", win: false, matchId: "NA1_2" });
  expect(bests.find(b => b.key === "kills")).toMatchObject({ value: "11 kills", matchId: "NA1_2" });
  // The 240-second game (100 CS/min) is below the floor; 270 over 30 minutes wins at 9.0.
  expect(bests.find(b => b.key === "farming")).toMatchObject({ value: "9.0 CS/min", matchId: "NA1_3" });
  expect(bests.find(b => b.key === "kda")).toMatchObject({ value: "Perfect", matchId: "NA1_3" });
  expect(personalBests(matches.slice(0, 4)).find(b => b.key === "kda")).toBeUndefined();
});

it("finds the longest win streak walking oldest to newest", () => {
  const matches = [ // newest first: W W L W W W -> chronological W W W L W W
    game(1, { win: true }), game(2, { win: true }), game(3, { win: false }),
    game(4, { win: true }), game(5, { win: true }), game(6, { win: true, champion: "Jinx" }),
  ];
  const streak = personalBests(matches).find(b => b.key === "streak");
  expect(streak).toMatchObject({ value: "3 games", matchId: "NA1_4" });
  expect(personalBests([game(1), game(2, { win: false })]).find(b => b.key === "streak")).toBeUndefined();
});

it("summarizes form with a last-five delta only when six rated games exist", () => {
  const matches = [ // newest first; chronological ratings: 5,5,5,5,5,8 -> last five avg 5.6, previous 5
    game(1, { performanceRating: 8 }), game(2, { performanceRating: 5 }), game(3, { performanceRating: 5 }),
    game(4, { performanceRating: 5 }), game(5, { performanceRating: 5 }), game(6, { performanceRating: 5 }),
  ];
  const form = formCurve(matches);
  expect(form!.points.map(p => p.rating)).toEqual([5, 5, 5, 5, 5, 8]);
  expect(form!.delta).toBeCloseTo(0.6);
  expect(form!.sentence).toContain("Form trending up: rating +0.6");
  const short = formCurve(matches.slice(0, 4));
  expect(short!.delta).toBeNull();
  expect(short!.sentence).toContain("average Baron Match Rating is");
  expect(formCurve(matches.slice(0, 2))).toBeNull();
  expect(formCurve([game(1), game(2)])).toBeNull();
});

it("counts duo records once per game with wins and losses, gated at three games", () => {
  const mate = { champion: "Thresh", name: "Duo", tag: "NA1" };
  const matches = [
    game(1, { win: true, teammates: [mate, mate] }),
    game(2, { win: false, teammates: [mate] }),
    game(3, { win: true, teammates: [mate] }),
    game(4, { win: true, teammates: [{ champion: "Sona", name: "Once", tag: "NA1" }] }),
    game(5, { win: true }),
  ];
  expect(teammateRecords(matches)[0]).toEqual({ name: "Duo", tag: "NA1", games: 3, wins: 2, losses: 1 });
  expect(duoSynergy(matches)).toMatchObject({ name: "Duo", games: 3, wins: 2, losses: 1 });
  expect(duoSynergy(matches.slice(0, 2))).toBeNull();
  expect(duoSynergy([game(1, { teammates: [{ champion: "Sona", name: "NoTag" }] })])).toBeNull();
});

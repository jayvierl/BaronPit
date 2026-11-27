import { expect, it } from "vitest";
import { buildPlayerAnalytics, formComparison } from "./player-analytics";
import { EARLY_SURRENDER_REASON } from "./match-performance";
import type { MatchSummary } from "./pure";

const now = Date.parse("2026-11-27T00:00:00Z");
const day = 86_400_000;

function game(id: number, overrides: Partial<MatchSummary> = {}): MatchSummary {
  return { matchId: `NA1_${id}`, champion: "Ahri", win: true, kills: 4, deaths: 2, assists: 8, cs: 160,
    durationSec: 1800, queueId: 420, role: "MIDDLE", playedAt: now - id * 1000, items: [], ...overrides };
}

it("uses official fractional champion classes and counts only known roles and distinct games", () => {
  const ahri = game(1);
  const sample = buildPlayerAnalytics([ahri, ahri, game(2,{champion:"Alistar",role:"UTILITY"}),
    game(3,{champion:"Uncatalogued",role:"",queueId:450})], now);
  expect(sample.sampleGames).toBe(3);
  expect(sample.knownRoles).toBe(2);
  expect(sample.roles).toEqual([{name:"Mid",count:1},{name:"Support",count:1}]);
  expect(sample.knownClasses).toBe(2);
  expect(sample.classes).toEqual([{name:"Assassin",count:.5},{name:"Mage",count:.5},{name:"Support",count:.5},{name:"Tank",count:.5}]);
  expect(sample.champions.find(c => c.id === "Ahri")).toMatchObject({games:1, wins:1, csPerMinute:{value:160/30,count:1}});
});

it("compares exactly the newest twenty recorded matches with up to eighty older ones, using measured KP only", () => {
  const matches = Array.from({length: 102}, (_,i) => game(i + 1, {
    win: i < 20, durationSec: i < 20 ? 1800 : 1600,
    deaths:i < 20 ? 2 : 4, killParticipation: i < 2 ? .6 : i === 20 ? .4 : undefined,
  }));
  const result = buildPlayerAnalytics(matches, now);
  expect(result.sampleGames).toBe(100);
  expect(result.performance.latest).toEqual({games:20, winRate:{value:100,count:20}, kda:{value:6,count:20},
    killParticipation:{value:60,count:2},gameLength:{value:1800,count:20}});
  expect(result.performance.earlier).toEqual({games:80, winRate:{value:0,count:80}, kda:{value:3,count:80},
    killParticipation:{value:40,count:1},gameLength:{value:1600,count:80}});
  expect(buildPlayerAnalytics([game(1,{deaths:0})], now).performance).toMatchObject({
    latest:{kda:{value:null,count:1},killParticipation:{value:null,count:0}}, earlier:{games:0,kda:{value:null,count:0}},
  });
});

it("includes only Solo/Duo and Flex results within the trailing 168 UTC hours", () => {
  const sample = buildPlayerAnalytics([
    game(1,{playedAt:now-7*day}), game(2,{playedAt:now-7*day-1,win:false}),
    game(3,{queueId:440,win:false}), game(4,{queueId:400}), game(5,{champion:"Alistar",playedAt:now+1}),
  ],now);
  expect(sample.rankedWeek).toEqual([{id:"Ahri",name:"Ahri",games:2,wins:1,losses:1}]);
  expect(sample.weekStart).toBe(now - 7*day);
});

it("adds per-champion rating averages, rating series and damage share only where stored", () => {
  const sample = buildPlayerAnalytics([
    game(3, { performanceRating: 4, teamDamageShare: .3 }),
    game(2, { performanceRating: 8, teamDamageShare: .2 }),
    game(1, { performanceRating: 6 }),
    game(4, { champion: "Vi", role: "JUNGLE" }),
  ], now);
  const ahri = sample.champions.find(c => c.id === "Ahri")!;
  expect(ahri.rating).toEqual({ value: 6, count: 3 });
  expect(ahri.ratingSeries).toEqual([6, 8, 4]);
  expect(ahri.damageShare).toEqual({ value: .25, count: 2 });
  const vi = sample.champions.find(c => c.id === "Vi")!;
  expect(vi.rating).toEqual({ value: null, count: 0 });
  expect(vi.damageShare).toEqual({ value: null, count: 0 });
  expect(vi.ratingSeries).toEqual([]);
});

it("breaks records down by role with the most-played role marked preferred", () => {
  const sample = buildPlayerAnalytics([
    game(1, { role: "BOTTOM", performanceRating: 9 }),
    game(2, { role: "BOTTOM", win: false, performanceRating: 5 }),
    game(3, { role: "UTILITY", champion: "Alistar" }),
    game(4, { role: "", champion: "Vi", queueId: 450 }),
  ], now);
  expect(sample.roleRecords).toEqual([
    { name: "Bot", games: 2, wins: 1, losses: 1, rating: { value: 7, count: 2 }, preferred: true },
    { name: "Support", games: 1, wins: 1, losses: 0, rating: { value: null, count: 0 }, preferred: false },
  ]);
});

it("shows head-to-head records only for opponents met at least twice", () => {
  const sample = buildPlayerAnalytics([
    game(1, { opponentChampion: "Lulu" }),
    game(2, { opponentChampion: "Lulu", win: false }),
    game(3, { opponentChampion: "Lulu" }),
    game(4, { opponentChampion: "Jinx", win: false }),
    game(5, {}),
  ], now);
  expect(sample.matchups).toEqual([{ name: "Lulu", games: 3, wins: 2, losses: 1 }]);
});

it("excludes flagged early surrenders from analytics only when asked", () => {
  const games = [game(1), game(2, { ratingReason: EARLY_SURRENDER_REASON, win: false }), game(3, { win: false })];
  expect(buildPlayerAnalytics(games, now).sampleGames).toBe(3);
  const excluded = buildPlayerAnalytics(games, now, { excludeEarlySurrenders: true });
  expect(excluded.sampleGames).toBe(2);
  expect(excluded.champions[0]).toMatchObject({ games: 2, wins: 1, losses: 1 });
});

it("compares the last twenty games with the previous twenty when forty are stored", () => {
  const matches = Array.from({ length: 45 }, (_, i) => game(i + 1, {
    win: i < 20, kills: i < 20 ? 8 : 4, performanceRating: i < 20 ? 8 : 4,
  }));
  const comparison = formComparison(matches);
  expect(comparison.latest).toMatchObject({ games: 20, winRate: { value: 100, count: 20 }, rating: { value: 8, count: 20 } });
  expect(comparison.earlier).toMatchObject({ games: 20, winRate: { value: 0, count: 20 }, rating: { value: 4, count: 20 } });
});

it("splits smaller samples into honest halves and skips flagged remakes in comparisons", () => {
  const matches = [
    ...Array.from({ length: 12 }, (_, i) => game(i + 1, { win: true })),
    game(99, { ratingReason: EARLY_SURRENDER_REASON, win: false }),
    ...Array.from({ length: 12 }, (_, i) => game(i + 21, { win: false })),
  ];
  const comparison = formComparison(matches);
  expect(comparison.latest).toMatchObject({ games: 12, winRate: { value: 100, count: 12 } });
  expect(comparison.earlier).toMatchObject({ games: 12, winRate: { value: 0, count: 12 } });
});

it("buckets only valid end timestamps by UTC hours and weekdays, leaving missing denominators empty", () => {
  const sample = buildPlayerAnalytics([
    game(1,{playedAt:Date.parse("2026-11-26T15:14:00Z"),startedAt:Date.parse("2026-11-26T14:40:00Z")}),
    game(2,{playedAt:Date.parse("2026-11-26T15:55:00Z"),win:false}),
    game(3,{playedAt:Date.parse("2026-11-25T00:03:00Z"),durationSec:0,killParticipation:1.1}),
    game(4,{playedAt:0}),
  ],now);
  expect(sample.activity.knownTimes).toBe(3);
  expect(sample.activity.days[3]).toEqual({name:"Thursday",games:2,wins:1,losses:1});
  expect(sample.activity.hours[15]).toEqual({hour:15,games:2,wins:1,losses:1});
  expect(sample.activity.hours[0]).toEqual({hour:0,games:1,wins:1,losses:0});
  expect(sample.activity.hours[14].games).toBe(0);
  expect(sample.performance.latest.gameLength.count).toBe(3);
  expect(sample.performance.latest.killParticipation).toEqual({value:null,count:0});
});

it("builds a day calendar across the actual stored range, gaps included", () => {
  const sample = buildPlayerAnalytics([
    game(1, { playedAt: Date.parse("2026-11-26T15:14:00Z") }),
    game(2, { playedAt: Date.parse("2026-11-26T18:55:00Z"), win: false }),
    game(3, { playedAt: Date.parse("2026-11-24T00:03:00Z"), win: false, durationSec: 3600 }),
    game(4, { playedAt: 0 }),
  ], now);
  expect(sample.calendar.start).toBe("2026-11-24");
  expect(sample.calendar.end).toBe("2026-11-26");
  expect(sample.calendar.days).toEqual([
    { date: "2026-11-24", games: 1, wins: 0, losses: 1 },
    { date: "2026-11-25", games: 0, wins: 0, losses: 0 },
    { date: "2026-11-26", games: 2, wins: 1, losses: 1 },
  ]);
  expect(sample.calendar.totalGames).toBe(3);
  // 30 + 30 minutes plus one 60-minute game = 2 hours over dated games.
  expect(sample.calendar.totalHours).toBe(2);
});

it("leaves the calendar empty when no match carries a usable timestamp", () => {
  const sample = buildPlayerAnalytics([game(1, { playedAt: 0 }), game(2, { playedAt: -5 })], now);
  expect(sample.calendar).toEqual({ days: [], start: null, end: null, totalGames: 0, totalHours: 0 });
});

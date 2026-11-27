import { expect, it } from "vitest";
import { buildPlayerAnalytics } from "./player-analytics";
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

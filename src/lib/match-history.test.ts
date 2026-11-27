import { expect, it } from "vitest";
import { matchSectionId, recentMatchHistory, matchQueueName } from "./match-history";
import { EARLY_SURRENDER_REASON } from "./match-performance";
import type { MatchSummary } from "./pure";

function game(matchId: string, champion: string, queueId: number, win = true): MatchSummary {
  return {matchId, champion, queueId, win, kills:1, deaths:0, assists:2, cs:10, durationSec:600, role:"", playedAt:1, items:[]};
}

it("intersects queue and champion before counting results and preserves newest-first order", () => {
  const games = [game("5","Ashe",420),game("4","Vi",420),game("3","Ashe",450,false),game("2","Ashe",420,false),game("1","Vi",440)];
  const stats = recentMatchHistory(games, "420", "ashe");
  expect(stats.matches.map(m => m.matchId)).toEqual(["5","2"]);
  expect(stats).toMatchObject({champion:"Ashe", wins:1, losses:1, winRate:50, sampleSize:5, champions:["Ashe","Vi"]});
  expect(recentMatchHistory(games, "450", "Vi")).toMatchObject({matches:[], winRate:null});
  expect(recentMatchHistory(games, "420", "Jinx")).toMatchObject({matches:[], champion:"Jinx"});
});

it("caps the source at 100 and keeps unknown queues distinct from custom matches", () => {
  const games = Array.from({length:101}, (_,i) => game(String(i),"Ashe",i===0 ? NaN : i===1 ? 0 : 4444,i===100));
  expect(recentMatchHistory(games)).toMatchObject({sampleSize:100, wins:0, winRate:0});
  expect(recentMatchHistory(games,"unknown")).toMatchObject({losses:1});
  expect(recentMatchHistory(games,"0").matches[0].matchId).toBe("1");
  expect(matchQueueName("unknown")).toBe("Queue unavailable");
  expect(matchQueueName("4444")).toBe("Queue 4444");
  expect(recentMatchHistory([])).toMatchObject({winRate:null, sampleSize:0});
});

it("uses stable fragment-safe anchors and skips malformed legacy match IDs", () => {
  expect(matchSectionId("NA1_999999")).toBe("match-NA1_999999");
  expect(matchSectionId("EUW1_123456")).toBe("match-EUW1_123456");
  for (const id of ["", "no spaces", "bad#fragment", "bad%escape", "x".repeat(81)]) {
    expect(matchSectionId(id)).toBeUndefined();
  }
});

it("filters by role only when the position is a real Riot role present in the sample", () => {
  const games = [
    { ...game("5", "Ashe", 420), role: "BOTTOM" },
    { ...game("4", "Ashe", 420, false), role: "UTILITY" },
    { ...game("3", "Vi", 420), role: "JUNGLE" },
    { ...game("2", "Vi", 450), role: "" },
  ];
  const stats = recentMatchHistory(games, "", "", "BOTTOM");
  expect(stats).toMatchObject({ role: "BOTTOM", roles: ["JUNGLE", "BOTTOM", "UTILITY"], wins: 1, losses: 0, winRate: 100 });
  expect(stats.matches.map(m => m.matchId)).toEqual(["5"]);
  expect(recentMatchHistory(games, "", "", "MIDDLE")).toMatchObject({ role: "MIDDLE", matches: [] });
  expect(recentMatchHistory(games, "", "", "BOTTOM ")).toMatchObject({ role: "" });
  expect(recentMatchHistory(games, "", "", " fill")).toMatchObject({ role: "" });
});

it("keeps remakes and early surrenders listed but out of the record and win rate", () => {
  const remake = { ...game("9", "Ashe", 420, false), ratingReason: EARLY_SURRENDER_REASON, durationSec: 200 };
  const games = [game("5", "Ashe", 420), remake, game("2", "Ashe", 420, false)];
  const stats = recentMatchHistory(games, "420", "Ashe");
  expect(stats.matches.map(m => m.matchId)).toEqual(["5", "9", "2"]);
  expect(stats).toMatchObject({ wins: 1, losses: 1, winRate: 50, excluded: 1 });
  const onlyRemake = recentMatchHistory([remake], "420", "Ashe");
  expect(onlyRemake).toMatchObject({ wins: 0, losses: 0, winRate: null, excluded: 1 });
});

it("filters ranked games across Solo/Duo and Flex while preserving champion selection", () => {
  const sample = [game("a","Ashe",420), game("b","Ashe",450), game("c","Ashe",440,false), game("d","Vi",440)];
  expect(recentMatchHistory(sample, "ranked", "ashe")).toMatchObject({
    queue: "ranked", matches: [sample[0], sample[2]], wins: 1, losses: 1, winRate: 50,
  });
});

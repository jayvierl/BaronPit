import { describe, expect, it } from "vitest";
import { playerFromRow } from "./riot";
import { publicPlayerSummary, readRankedEntries, type RankedEntry } from "./player-summary";

const solo: RankedEntry = {queueType:"RANKED_SOLO_5x5",tier:"GOLD",rank:"II",leaguePoints:42,wins:80,losses:20};
const flex: RankedEntry = {queueType:"RANKED_FLEX_SR",tier:"EMERALD",rank:"IV",leaguePoints:19,wins:1,losses:9};
const row = {puuid:"fixture",platform:"na1",game_name:"Fixture",tag_line:"NA1",fetched_at:"2025-12-15T03:00:00Z"};

describe("public Riot profile summary", () => {
  it("prioritizes Solo/Duo, counts the whole published ladder record and weights both queues by their number of games", () => {
    const player = playerFromRow({...row, snapshot:{rankedEntries:[flex,solo]}});
    expect(publicPlayerSummary(player)).toMatchObject({
      rank:"Gold II · 42 LP",queue:"Ranked Solo/Duo",rankStatus:"ranked",
      games:100,wins:80,losses:20,winRate:80,
      rankedGames:110,rankedWins:81,rankedLosses:29,rankedWinRate:74,
      hasBothQueues:true,rankedGamesScope:"solo-and-flex",sampleGames:0,topRole:null,
      asOf:"2025-12-15T03:00:00.000Z",
    });
  });

  it("displays a Flex-only player without transferring that rank into Solo/Duo eligibility", () => {
    const player = playerFromRow({...row,snapshot:{rankedEntries:[flex]}});
    expect(player.rankTier).toBeNull();
    expect(publicPlayerSummary(player)).toMatchObject({
      queue:"Ranked Flex",rank:"Emerald IV · 19 LP",games:10,winRate:10,hasBothQueues:false,
    });
  });

  it("keeps a reliable legacy Solo/Duo record and does not invent missing counts or Flex coverage", () => {
    const player = playerFromRow({...row,rank_tier:"MASTER",rank_div:"I",rank_lp:99,rank_wins:11});
    expect(publicPlayerSummary(player)).toMatchObject({
      rank:"Master · 99 LP",games:null,rankedWinRate:null,rankedGamesScope:"selected-queue",
    });
    expect(publicPlayerSummary({...player, rankLosses:9})).toMatchObject({
      rankedGames:20,rankedWinRate:55,hasBothQueues:false,
    });
    expect(publicPlayerSummary(playerFromRow(row))).toMatchObject({
      rankStatus:"unavailable",rankedGames:null,
    });
  });

  it("distinguishes no published rank or a zero denominator from an actual zero win rate", () => {
    const summary = (rankedEntries: unknown) => publicPlayerSummary(playerFromRow({...row,snapshot:{rankedEntries}}));
    expect(summary([])).toMatchObject({rank:"Unranked",rankStatus:"unranked",games:null,winRate:null});
    expect(summary([{...solo,wins:0,losses:0}])).toMatchObject({games:0,winRate:null});
    expect(summary([{...solo,wins:0,losses:2}])).toMatchObject({games:2,winRate:0});
    expect(readRankedEntries([{...solo,wins:-3}])).toBeUndefined();
    expect(readRankedEntries([solo,solo])).toBeUndefined();
    expect(readRankedEntries([null])).toBeUndefined();
    expect(readRankedEntries([solo,{queueType:"CHERRY"}])).toEqual([solo]);
  });

  it("caps the all-queue sample, ignores games with unknown roles, and preserves role ties", () => {
    const matches = Array.from({length:21},(_,i) => ({
      matchId:String(i),champion:i<8?"Ashe":i<16?"Jhin":"Janna",win:false,kills:1,deaths:2,assists:3,
      cs:10,durationSec:900,playedAt:100,queueId:i<10?420:450,
      role:i<8?"MIDDLE":i<16?"UTILITY":"NONE",
    }));
    const player = playerFromRow({...row,snapshot:{matches,rankedEntries:[solo]}});
    expect(publicPlayerSummary(player)).toMatchObject({
      sampleGames:20,topRole:{name:"Mid / Support",games:8},
      champions:[{name:"Ashe",games:8},{name:"Jhin",games:8},{name:"Janna",games:4}],rankedGames:100,
    });
    expect(publicPlayerSummary(playerFromRow({...row,snapshot:{
      games:3,wins:1,losses:2,kda:2,roles:{"":3},champPool:[{champion:"Ashe",games:3,wins:1,kda:2}],
    }}))).toMatchObject({sampleGames:3,topRole:null,champions:[{name:"Ashe",games:3}]});
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PlayerStats } from "./player-stats";
import { EMPTY_SNAPSHOT } from "../lib/pure";
import type { Player } from "../lib/riot";

const player: Player = {
  puuid: "fixture", gameName: "River", tagLine: "NA1", platform: "na1",
  summonerLevel: 100, profileIcon: 1, rankTier: "GOLD", rankDiv: "IV", rankLp: 6,
  rankWins: 7, rankLosses: 3, snapshot: EMPTY_SNAPSHOT, fetchedAt: "2026-11-26T01:00:00Z",
};

it("labels the headline queue and combines both ranked records only in the disclosure", () => {
  const html = renderToStaticMarkup(createElement(PlayerStats, { player: {
    ...player,
    rankedEntries: [
      {queueType:"RANKED_SOLO_5x5", tier:"GOLD",rank:"IV",leaguePoints:6,wins:7,losses:3},
      {queueType:"RANKED_FLEX_SR", tier:"SILVER",rank:"II",leaguePoints:11,wins:3,losses:17},
    ],
    snapshot: {...EMPTY_SNAPSHOT, games: 2, roles: {BOTTOM:1,UTILITY:1}, champPool: [{champion:"Ashe", games:2,wins:1,kda:4}]},
  }, lookupHref: "/player?riotId=River%23NA1" }));
  for (const value of ["Gold IV", "Ranked Solo/Duo", "70%", "Other ranked stats", "30 games", "33%",
    "Last 2 games · all queues", "Bot / Support", "1 game each", "Ashe", "View match history"]) expect(html).toContain(value);
});

it("distinguishes absent data, unplaced rank and a stale snapshot without displaying a made-up record", () => {
  const html = renderToStaticMarkup(createElement(PlayerStats, { player: {...player, rankedEntries: []}, source: "stale" }));
  for (const value of ["Riot couldn’t refresh", "Unranked", "Record unavailable", "No recent games", "UTC"]) expect(html).toContain(value);
  for (const value of ["Other ranked stats", "0%", "0W", "0L"]) expect(html).not.toContain(value);
});

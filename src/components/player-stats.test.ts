import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { LEAGUE_TIERS } from "../lib/rank";
import { expect, it, vi } from "vitest";
import { PlayerStats } from "./player-stats";
import { EMPTY_SNAPSHOT } from "../lib/pure";
import type { Player } from "../lib/riot";

const player: Player = {
  puuid: "fixture", gameName: "River", tagLine: "NA1", platform: "na1",
  summonerLevel: 100, profileIcon: 1, rankTier: "GOLD", rankDiv: "IV", rankLp: 6,
  rankWins: 7, rankLosses: 3, snapshot: EMPTY_SNAPSHOT, fetchedAt: "2026-11-26T01:00:00Z",
};

it("shows separately tinted Solo/Duo and Flex records before the combined disclosure", () => {
  const html = renderToStaticMarkup(createElement(PlayerStats, { player: {
    ...player,
    rankedEntries: [
      {queueType:"RANKED_SOLO_5x5", tier:"GOLD",rank:"IV",leaguePoints:6,wins:7,losses:3},
      {queueType:"RANKED_FLEX_SR", tier:"SILVER",rank:"II",leaguePoints:11,wins:3,losses:17},
    ],
    snapshot: {...EMPTY_SNAPSHOT, games: 2, roles: {BOTTOM:1,UTILITY:1}, champPool: [{champion:"Ashe", games:2,wins:1,kda:4}]},
  }, lookupHref: "/player?riotId=River%23NA1" }));
  const solo = html.substring(html.indexOf('aria-label="Ranked Solo/Duo"'), html.indexOf('aria-label="Ranked Flex"'));
  const flex = html.substring(html.indexOf('aria-label="Ranked Flex"'), html.indexOf("<details"));
  expect(solo).toContain('data-tier="GOLD"');
  expect(solo).toMatch(/<dt>Win rate<\/dt><dd>70%<small>7W · 3L<\/small><\/dd>/);
  expect(flex).toContain('data-tier="SILVER"');
  expect(flex).toMatch(/<dt>Win rate<\/dt><dd>15%<small>3W · 17L<\/small><\/dd>/);
  for (const value of ["Gold IV", "Silver II", "Combined ranked record", "30 games", "33%",
    "Last 2 games · all queues", "Bot / Support", "1 game each", "Ashe", "View match history"]) expect(html).toContain(value);
});

it("shows just a Flex placement and does not borrow the legacy Solo/Duo rank", () => {
  const html = renderToStaticMarkup(createElement(PlayerStats, { player: { ...player, rankedEntries: [
    {queueType:"RANKED_FLEX_SR", tier:"EMERALD",rank:"I",leaguePoints:21,wins:0,losses:2},
  ] }}));
  expect(html).toContain('aria-label="Ranked Flex"');
  expect(html).toContain('data-tier="EMERALD"');
  expect(html).toContain("0%<small>0W · 2L</small>");
  expect(html).not.toContain("Ranked Solo/Duo");
  expect(html).not.toContain("Combined ranked record");
});

it("shows both profile queues and distinguishes an unplaced queue from unknown legacy data", () => {
  const view = (rankedEntries: Player["rankedEntries"]) => renderToStaticMarkup(createElement(PlayerStats, {
    variant: "profile", player: { ...player, rankedEntries },
  }));
  const flexOnly = view([{ queueType: "RANKED_FLEX_SR", tier: "EMERALD", rank: "I", leaguePoints: 21, wins: 2, losses: 1 }]);
  const legacy = view(undefined);
  for (const html of [flexOnly, legacy]) {
    expect(html).toContain('aria-label="Ranked Solo/Duo"');
    expect(html).toContain('aria-label="Ranked Flex"');
    expect(html).not.toContain("Most played champions");
    expect(html).not.toContain("Combined ranked record");
  }
  expect(flexOnly).toMatch(/aria-label="Ranked Solo\/Duo"[^>]*><h3>Ranked Solo\/Duo<\/h3><span[^>]+>Unranked<\/span>/);
  expect(flexOnly).toContain("Emerald I · 21 LP");
  expect(flexOnly).toContain("67%");
  expect(legacy).toContain("Gold IV · 6 LP");
  expect(legacy).toMatch(/aria-label="Ranked Flex"[^>]*><h3>Ranked Flex<\/h3><span[^>]+>Rank unavailable<\/span>/);
});

it("distinguishes absent data, unplaced rank and a stale snapshot without displaying a made-up record", () => {
  const html = renderToStaticMarkup(createElement(PlayerStats, { player: {...player, rankedEntries: []}, source: "stale" }));
  expect(html).toContain('data-tier="neutral"');
  for (const value of ["Riot couldn’t refresh", "Last known Riot records", "Unranked", "Record unavailable", "No recent games", "UTC"]) expect(html).toContain(value);
  for (const value of ["Combined ranked record", "0%", "0W", "0L"]) expect(html).not.toContain(value);
});

it("dates prior-year linked data as last known even without a failed refresh", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-01-01T00:03:00Z"));
    const html = renderToStaticMarkup(createElement(PlayerStats, { player: { ...player, fetchedAt: "2025-12-31T23:58:00Z" } }));
    expect(html).toContain("Last known Riot records");
    expect(html).toContain('dateTime="2025-12-31T23:58:00.000Z"');
    expect(html).toContain("Dec 31, 2025");
    expect(html).not.toContain("This ranked year");
    expect(html).not.toContain("Riot couldn’t refresh");
  } finally {
    vi.useRealTimers();
  }
});

it("has a legible tint for each text rank in both color schemes", () => {
  const css = readFileSync(new URL("./rank-badge.module.css", import.meta.url), "utf8");
  const [light,dark] = css.split("@media (prefers-color-scheme: dark)");
  const luminance = (rgb: number[]) => rgb.reduce((value, channel, i) => {
    const level = channel / 255;
    return value + [0.2126,0.7152,0.0722][i] * (level <= 0.04045 ? level / 12.92 : ((level + 0.055) / 1.055) ** 2.4);
  }, 0);
  for (const [theme, canvas] of [[light, 255], [dark, 0]] as const) {
    for (const tier of LEAGUE_TIERS) {
      const hex = theme.match(new RegExp('data-tier="' + tier + '"[^}]*#([0-9a-f]{6})'))?.[1];
      expect(hex, tier).toBeTruthy();
      const rgb = hex!.match(/../g)!.map(x => parseInt(x,16));
      const ink = luminance(rgb);
      const surface = luminance(rgb.map(c => 0.08 * c + 0.92 * canvas));
      expect((Math.max(ink,surface) + 0.05)/(Math.min(ink,surface) + 0.05), tier).toBeGreaterThanOrEqual(4.5);
    }
  }
});

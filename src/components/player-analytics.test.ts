import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { buildPlayerAnalytics } from "@/lib/player-analytics";
import type { MatchSummary } from "@/lib/pure";
import { PlayerActivity, PlayerChampionAnalytics, PlayerPerformance, PlayerPlayStyle, PlayerRoleBreakdown } from "./player-analytics";

const now = Date.parse("2026-11-27T00:00:00Z");
const example: MatchSummary = { matchId: "NA1_1", champion: "Ahri", win: true, kills: 6, deaths: 2, assists: 5, cs: 140,
  durationSec: 1800, queueId: 420, role: "MIDDLE", playedAt: Date.parse("2026-11-26T15:24:00Z"), items: [] };

it("labels partial results, fractional class tags and UTC activity without claiming unseen games", () => {
  const analytics = buildPlayerAnalytics([example], now);
  const props = {analytics,partial:true};
  const style = renderToStaticMarkup(createElement(PlayerPlayStyle,props));
  expect(style).toContain("1 public game available");
  expect(style).toContain("Each game is split evenly across the champion’s Data Dragon classes.");
  expect(style).toMatch(/Assassin<\/span>[\s\S]*?50%/);
  const performance = renderToStaticMarkup(createElement(PlayerPerformance,props));
  expect(performance).toContain("Earlier games are needed");
  expect(performance).not.toContain("Previous 80");
  expect(performance).toMatch(/Kill participation<\/th><td>—<small>0 games measured<\/small>/);
  const activity = renderToStaticMarkup(createElement(PlayerActivity,props));
  expect(activity).toContain("Match end times in UTC");
  expect(activity).toContain("Hour-by-hour results (UTC)");
  expect(activity).toMatch(/3 PM<\/span>[\s\S]*?1 game · 1W · 100% WR/);
});

it("renders a sortable champion table with rating averages, sparklines and honest damage gaps", () => {
  const rated = { ...example, performanceRating: 7 };
  const analytics = buildPlayerAnalytics([
    rated, { ...rated, matchId: "NA1_2", performanceRating: 9 },
    { ...example, matchId: "NA1_3", champion: "Ashe", win: false },
  ], now);
  const html = renderToStaticMarkup(createElement(PlayerChampionAnalytics, {
    analytics, patch: "16.23.1",
    sort: { key: "rating" as const, dir: "desc" as const, base: "/player?platform=na1&riotId=X%23NA1" },
  }));
  expect(html).toContain("Avg rating");
  expect(html).toContain("8.0"); // Ahri average of 7 and 9
  expect(html).toContain("2 games rated");
  expect(html).toContain("Average rating covers 2 rated games in this sample.");
  expect(html).toContain("<svg"); // rating sparkline for Ahri
  expect(html).toContain("Team dmg");
  expect(html).toContain("—"); // Ashe has no rating or damage data
  expect(html).toContain('href="/player?platform=na1&amp;riotId=X%23NA1&amp;csort=kda&amp;cdir=desc#player-champions"');
  expect(html).toContain('aria-sort="descending"');
});

it("shows head-to-head records and the preferred role in the breakdown", () => {
  const analytics = buildPlayerAnalytics([
    { ...example, opponentChampion: "Lulu" },
    { ...example, matchId: "NA1_2", opponentChampion: "Lulu", win: false },
    { ...example, matchId: "NA1_3", champion: "Ashe", role: "BOTTOM" },
  ], now);
  const champs = renderToStaticMarkup(createElement(PlayerChampionAnalytics, { analytics, patch: "16.23.1" }));
  expect(champs).toContain("Head-to-head");
  expect(champs).toContain("vs Lulu");
  expect(champs).toContain("1W–1L");
  const roles = renderToStaticMarkup(createElement(PlayerRoleBreakdown, { analytics }));
  expect(roles).toContain("Role breakdown");
  expect(roles).toContain("Mid");
  expect(roles).toContain("Preferred");
});

it("keeps champion room and build links working without presenting the seven-day list as complete history", () => {
  const analytics = buildPlayerAnalytics([example,{...example,matchId:"NA1_2",champion:"Ashe",win:false}],now);
  const result = renderToStaticMarkup(createElement(PlayerChampionAnalytics,{analytics,patch:"16.23.1",visibleRooms:new Set(["champ-ahri"])}));
  expect(result).toContain("Latest 2 public games");
  expect(result).toContain('href="/rooms/champ-ahri"');
  expect(result).toContain('href="/builds?champ=Ashe"');
  expect(result).toContain("Solo/Duo and Flex games in this snapshot");
  expect(result).toContain("1W–0L");
  expect(result).toContain("0W–1L");
});

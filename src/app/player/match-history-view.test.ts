import { PassThrough } from "node:stream";
import { createElement } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { MatchSummary } from "../../lib/pure";
import { LatestGames, OlderGames } from "./match-history-view";
import { matchFilterPath, olderMatchHref, olderMatchPage } from "./older-match-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const base = { patch: "16.23.1", platform: "na1", riotId: "Fixture#NA1", persisted: true, lookupHref: "/player?platform=na1&riotId=Fixture%23NA1&from=%2Fsearch%3Fq%3DFixture", queueFilter: "420", championFilter: "Ashe" };

function game(i: number): MatchSummary {
  return { matchId: `NA1_${i}`, champion: "Ashe", win: true, kills: 7, deaths: 2, assists: 6, cs: 180,
    durationSec: 1800, queueId: 420, role: "BOTTOM", playedAt: Date.UTC(2026, 10, 25) - i * 3600_000, items: [] };
}

function render(element: React.ReactElement) {
  return new Promise<string>((resolve, reject) => {
    const output = new PassThrough();
    output.setEncoding("utf8");
    let html = "";
    output.on("data", (chunk: string) => { html += chunk; });
    output.on("end", () => resolve(html.replaceAll("<!-- -->", "")));
    output.on("error", reject);
    const response = renderToPipeableStream(element, { onAllReady: () => response.pipe(output), onError: reject });
  });
}

it("renders actual match metrics, Data Dragon builds and both public teams", async () => {
  const match: MatchSummary = {
    ...game(1), championLevel: 16, killParticipation: .65, items: [1001], spellIds: [4,12],
    runes: { keystone: 8005, primaryStyle: 8000, secondaryStyle: 8400 },
    teams: { allies: [{ champion: "Ashe", isPlayer: true, name: "Fixture", tag: "NA1" }, { champion: "Nami", name: "Ally", tag: "WAVE" }],
      opponents: [{ champion: "Vi", name: "Rival", tag: "NA1" }, { champion: "Jinx", name: "Withheld" }] },
  };
  const html = await render(createElement(LatestGames, {
    ...base, matches: [match],
  }));
  for (const value of ["Ranked Solo/Duo", "Level 16", "30m 0s", "7/2/6", "6.50 KDA", "180 CS (6.0 CS/m)", "65% P/Kill",
    "Flash", "SummonerFlash.png", "Teleport", "Keystone: Press the Attack", "Primary: Precision", "Secondary: Resolve",
    "Allied team", "Opposing team", "Ally#WAVE", "Rival#NA1", "Jinx", "Boots", "Discuss this match"]) expect(html).toContain(value);
  expect(html).not.toContain("Withheld");
  const link = html.match(/href="([^"<>]+)"[^>]*>Ally#WAVE<\/a>/)?.[1];
  const url = new URL(link!.replaceAll("&amp;", "&"), "https://example.invalid");
  expect(url.searchParams.get("fromPlayer")).toContain("queue=420&champion=Ashe#match-NA1_1");
});

it("shows stored damage in the scoreboard and expanded numbers, with gaps marked not zeroed", async () => {
  const match: MatchSummary = {
    ...game(1), performanceRating: 8.3, ratingReason: "Largest difference against the opposing role: kill participation, 65% vs 35%.",
    damage: 20000, damageTaken: 9000, teamDamageShare: 1 / 3, damageVersion: 1,
    teams: { allies: [
        { champion: "Ashe", isPlayer: true, name: "Fixture", tag: "NA1", performanceRating: 8.3, damage: 20000, damageShare: 1 / 3 },
        { champion: "Nami", name: "Ally", tag: "WAVE", performanceRating: 6 },
      ],
      opponents: [{ champion: "Vi", name: "Rival", tag: "NA1", damage: 12000, damageShare: .24 }] },
  };
  const html = await render(createElement(LatestGames, { ...base, matches: [match] }));
  expect(html).toContain("180 CS"); // collapsed row carries raw CS
  expect(html).toContain("20.0k damage (33% of team)");
  expect(html).toContain("9.0k damage taken");
  expect(html).toContain("20.0k dmg");
  expect(html).toContain("12.0k dmg");
  expect(html).toContain("24%"); // team share rides in its own span under the total
  expect(html).toContain("—"); // the unrated, damage-less ally is marked, not zeroed
  // Scoreboards come before the score explanation in the expanded card.
  expect(html.indexOf("Allied team")).toBeLessThan(html.indexOf("Why this score?"));
});

it("preserves legacy rows without guessing unknown metrics or displaying private roster data", async () => {
  const match = { ...game(1), queueId: 0, durationSec: 0, spellIds: [4,99999] as [number, number],
    teammates: [{ champion: "Vi", name: "Private", tag: "OWN" }] };
  const html = await render(createElement(LatestGames, {
    ...base, matches: [match],
  }));
  for (const value of ["Custom", "Unlisted spell 99999", "Runes unavailable", "Full team details unavailable", "Champion level unavailable", "Duration and CS/m unavailable"]) {
    expect(html).toContain(value);
  }
  for (const value of ["Private#OWN", "NaN", "Infinity", "Share as card", "Ask about this game", "Discuss this match"]) expect(html).not.toContain(value);
});

it("paginates a hundred matches on the server and expands exactly the selected older row", async () => {
  const matches = Array.from({ length: 100 }, (_, index) => game(index + 1));
  expect(olderMatchPage(matches, undefined, "NA1_86")).toMatchObject({ total: 97, page: 9, pages: 10, selected: "NA1_86", open: true });
  expect(olderMatchPage(matches, "99")).toMatchObject({ page: 10, offset: 90 });
  expect(olderMatchPage(matches, "-1", "outside")).toMatchObject({ page: 1, open: false });
  const returnHref = olderMatchHref(matchFilterPath(base.lookupHref, "420", "Ashe"), 9, "NA1_86");
  expect(returnHref).toContain("&queue=420&champion=Ashe&older=9&match=NA1_86#match-NA1_86");
  const html = await render(createElement(OlderGames, { ...base, matches, rawMatch: "NA1_86" }));
  expect(html.match(/\bid="match-NA1_\d+"/g)).toHaveLength(10);
  expect(html.match(/<summary>Match details/g)).toHaveLength(1);
  expect(html.match(/data-motion=/g)).toBeNull();
  expect(html).toContain("Older games 81–90 of 97");
  expect(html).toContain("&amp;older=10#older-games");
  const discuss = html.match(/href="([^"<>]+)"[^>]*>Discuss this match<\/a>/)?.[1];
  const url = new URL(discuss!.replaceAll("&amp;", "&"), "https://example.invalid");
  expect(url.searchParams.get("fromMatch")).toBe(returnHref);
  expect(url.searchParams.has("puuid")).toBe(false);
  const departed = await render(createElement(OlderGames, { ...base, persisted: false, matches, rawMatch: "NA1_101" }));
  expect(departed).toContain("This match is unavailable in the current recent-match window or filters.");
  expect(departed).not.toContain('id="match-NA1_101"');
  expect(departed).not.toContain("Discuss this match");
});

it("keeps the prior player, active filters and older page when opening an objective timeline", async () => {
  const source = "/player?platform=na1&riotId=Previous%23NA1#match-NA1_82";
  const lookupHref = base.lookupHref + "&fromPlayer=" + encodeURIComponent(source);
  const matches = Array.from({length:25},(_,index)=>game(index+1));
  const html = await render(createElement(OlderGames,{...base,lookupHref,matches,rawMatch:"NA1_16"}));
  const link = html.match(/href="([^"<>]+)"[^>]*>View objective timeline<\/a>/)?.[1];
  const url = new URL(link!.replaceAll("&amp;","&"),"https://fixture.invalid");
  expect(Object.fromEntries(url.searchParams)).toMatchObject({fromPlayer:source,queue:"420",champion:"Ashe",older:"2",match:"NA1_16",timeline:"objectives"});
  expect(url.hash).toBe("#match-NA1_16");
});

it("keeps the rating and badge visible beside duration, age and items, and repeats the same score on the scoreboard", async () => {
  const viewed = { champion: "Nami", isPlayer: true as const, performanceRating: 8.276, ratingBadge: "Team Ace" as const };
  const match: MatchSummary = {
    ...game(1), ...viewed, win: false, role: "UTILITY", durationSec: 1051, playedAt: Date.now() - 7 * 3600_000,
    vision: 37, items: [1001], detailsVersion: 3, ratingReason: "Higher vision per minute than the opposing support.",
    teams: { allies: [viewed], opponents: [{ champion: "Lulu", performanceRating: 8.152, ratingBadge: "MVP" }] },
  };
  const html = await render(createElement(LatestGames, { ...base, matches: [match] }));
  const glance = html.slice(0, html.indexOf("<details"));
  for (const marker of ["Duration 17m 31s", "Played 7h ago", "Support", "37 vision", "Boots", "Team Ace", "8.3"]) {
    expect(glance).toContain(marker);
  }
  expect(html.match(/Baron Match Rating 8.3 out of 10/g)).toHaveLength(2);
  for (const marker of ["Why this score?", match.ratingReason, 'data-viewed="true"', "Baron Match Rating 8.2 out of 10", ">MVP<"]) expect(html).toContain(marker);
  const sparse = await render(createElement(LatestGames, { ...base, matches: [game(2)] }));
  expect(sparse).toContain("Not rated");
  expect(sparse).toContain("no current rating evidence");
});

it("gives the scoreboard shared Player / Damage / Rating columns and keeps long Riot IDs whole", async () => {
  const match: MatchSummary = {
    ...game(1),
    teams: { allies: [
        { champion: "Annie", isPlayer: true, name: "GAMBLING ADDICT", tag: "NA4", performanceRating: 8.3, damage: 21000, damageShare: .3 },
        { champion: "Nami", name: "AveryLongUnbrokenTeammateName", tag: "LONG", damage: 0 },
      ],
      opponents: [{ champion: "Vi", name: "Rival", tag: "NA1" }] },
  };
  const html = await render(createElement(LatestGames, { ...base, matches: [match] }));
  // Column labels exist once per team, ahead of the rows they describe.
  expect(html.match(/>Player</g)).toHaveLength(2);
  expect(html.match(/>Damage</g)).toHaveLength(2);
  expect(html.match(/>Rating</g)).toHaveLength(2);
  // Long names render in full in the scoreboard (wrapping is a CSS concern);
  // nothing is ellipsized in the markup.
  expect(html).toContain("GAMBLING ADDICT#NA4");
  expect(html).toContain("AveryLongUnbrokenTeammateName#LONG");
  expect(html).not.toContain("…");
  // Zero damage is a real zero; missing damage stays an em dash.
  expect(html).toContain("0.0k dmg");
  expect(html).toContain("—");
});

it("renders match tags with their real numbers in the tooltip and screen-reader text", async () => {
  const match: MatchSummary = { ...game(1), killParticipation: .82, teamKills: 17, vision: 58, deaths: 0 };
  const html = await render(createElement(LatestGames, { ...base, matches: [match] }));
  const glance = html.slice(0, html.indexOf("<details"));
  for (const label of ["In Every Fight", "Servant of Darkness", "Untouchable"]) expect(glance).toContain(label);
  expect(glance).toContain('title="Involved in 82% of your team&#x27;s 17 kills."');
});

it("groups the latest games under day headers with the group's counted record", async () => {
  const matches = [
    { ...game(1), playedAt: Date.UTC(2026, 10, 25, 10) },
    { ...game(2), playedAt: Date.UTC(2026, 10, 25, 9), win: false },
    { ...game(3), playedAt: Date.UTC(2026, 10, 24, 10) },
  ];
  const html = await render(createElement(LatestGames, { ...base, matches }));
  expect(html).toMatch(/(Today|Yesterday|Wednesday, Nov 25, 2026)/);
  expect(html).toContain("1W–1L · 50% win rate");
  expect(html).toMatch(/(Today|Yesterday|Tuesday, Nov 24, 2026)/);
  expect(html).toContain("1W–0L · 100% win rate");
});

it("shows the participant mini-list on collapsed rows only when team rosters are stored", async () => {
  const withTeams: MatchSummary = {
    ...game(1),
    teams: { allies: [{ champion: "Ashe", isPlayer: true, name: "Fixture", tag: "NA1" }, { champion: "Nami", name: "Ally", tag: "WAVE" }],
      opponents: [{ champion: "Vi" }, { champion: "Jinx" }] },
  };
  const html = await render(createElement(LatestGames, { ...base, matches: [withTeams] }));
  const glance = html.slice(0, html.indexOf("<details"));
  expect(glance).toContain("Ally");
  expect(glance).toContain("Vi");
  expect(glance).toContain("Jinx");
  const legacy = await render(createElement(LatestGames, { ...base, matches: [{ ...game(2), teammates: [{ champion: "Vi", name: "Private", tag: "OWN" }] }] }));
  expect(legacy.slice(0, legacy.indexOf("<details"))).not.toContain("Private");
});

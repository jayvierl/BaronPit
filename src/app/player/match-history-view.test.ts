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
    ...base, matches: [match], communityMatchIds: new Set([match.matchId]),
  }));
  for (const value of ["Ranked Solo/Duo", "Level 16", "30m 0s", "7/2/6", "6.50 KDA", "180 CS (6.0 CS/m)", "65% P/Kill",
    "Flash", "SummonerFlash.png", "Teleport", "Keystone: Press the Attack", "Primary: Precision", "Secondary: Resolve",
    "Allied team", "Opposing team", "Ally#WAVE", "Rival#NA1", "Jinx", "Boots", "Discuss this match"]) expect(html).toContain(value);
  expect(html).not.toContain("Withheld");
  const link = html.match(/href="([^"<>]+)"[^>]*>Ally#WAVE<\/a>/)?.[1];
  const url = new URL(link!.replaceAll("&amp;", "&"), "https://example.invalid");
  expect(url.searchParams.get("fromPlayer")).toContain("queue=420&champion=Ashe#match-NA1_1");
});

it("preserves legacy rows without guessing unknown metrics or displaying private roster data", async () => {
  const match = { ...game(1), queueId: 0, durationSec: 0, spellIds: [4,99999] as [number, number],
    teammates: [{ champion: "Vi", name: "Private", tag: "OWN" }] };
  const html = await render(createElement(LatestGames, {
    ...base, matches: [match], communityMatchIds: new Set<string>(),
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
  expect(html.match(/\bclass="game-row/g)).toHaveLength(1);
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

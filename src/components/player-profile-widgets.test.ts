import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PlayerMastery } from "./player-mastery";
import { RefreshPlayer } from "./refresh-player";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const fetchedAt = "2026-11-26T01:00:00.000Z";
const profile = "/player?platform=na1&riotId=Jay+Lewis%23NA1&queue=420&champion=Renata&from=%2Fsearch&fromPlayer=%2Fplayer%3FriotId%3DPrevious";

it("renders a native force request with the current profile context and honest refresh feedback", () => {
  const render = (source: "cache" | "live" | "stale", retryAt?: string) => renderToStaticMarkup(createElement(RefreshPlayer, {
    href: profile, fetchedAt, source, requested: true, retryAt,
  }));
  const cached = render("cache", "2026-11-26T01:02:22.000Z");
  expect(cached).toMatch(/<form[^>]+action="\/player"[^>]+method="get"/i);
  for (const field of ['name="force" value="1"', 'name="riotId" value="Jay Lewis#NA1"', 'name="queue" value="420"',
    'name="champion" value="Renata"', 'name="from" value="/search"', 'name="fromPlayer" value="/player?riotId=Previous"']) {
    expect(cached).toContain(field);
  }
  expect(cached).toContain("Last updated");
  expect(cached).toContain(`dateTime="${fetchedAt}"`);
  expect(cached).toContain("Checked recently");
  expect(cached).toContain("1:02:22 AM UTC");
  expect(render("live")).toContain("Stats updated.");
  expect(render("stale")).toContain("Showing the last saved record.");
  expect(render("stale")).not.toContain("Try again after");
});

it("shows mastery points and levels from verified champion IDs and distinguishes unavailable from empty", () => {
  const data = {
    fetchedAt,
    champions: [
      { championId: 888, level: 36, points: 272100 },
      ...Array.from({ length: 8 }, (_, index) => ({ championId: 1000 + index, level: 1, points: 72 })),
    ],
  };
  const render = (mastery?: typeof data) => renderToStaticMarkup(createElement(PlayerMastery, { patch: "16.23.1", mastery }));
  const real = render(data);
  for (const text of ["Champion mastery", "Renata Glasc", "272,100 points", "Level 36", 'dateTime="' + fetchedAt + '"', "Champion 1006"]) {
    expect(real).toContain(text);
  }
  expect(real).not.toContain("Champion 1007");
  expect(render()).toContain("Mastery is unavailable");
  expect(render({ fetchedAt, champions: [] })).toContain("Riot has no mastery entries");
});

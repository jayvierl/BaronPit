import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerRankHistory } from "../components/player-rank-history";
import { postgres } from "../../test/postgres";
import { getSql, q } from "./db";
import { readPlayerRankHistory } from "./rank-history-store";
import { rankHistoryPosition, type RankHistoryPoint } from "./rank-history";
import { lookupPlayer } from "./riot";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));

const puuid = "private-riot-ref";
const solo = { queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "IV", leaguePoints: 30, wins: 5, losses: 2 };
const flex = { ...solo, queueType: "RANKED_FLEX_SR", tier: "SILVER", rank: "I", leaguePoints: 52 };
const setTime = (value: string) => vi.setSystemTime(new Date(value));
const lookup = (name = "Fixture") => lookupPlayer("na1", name, "NA1");
const riotBody = {
  account: { puuid, gameName: "Fixture", tagLine: "NA1" },
  summoner: { profileIconId: 1, summonerLevel: 50 },
};

function riotFixture(ranks: () => Response | Promise<Response>, ids = () => Promise.resolve(Response.json([]))) {
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.includes("/riot/account/")) return Response.json(riotBody.account);
    if (url.includes("/lol/summoner/")) return Response.json(riotBody.summoner);
    if (url.includes("/lol/league/")) return ranks();
    if (url.includes("/ids?") && url.includes("start=0")) return ids();
    return Response.json([]);
  });
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://local-fixture.invalid/rank-archive");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("RIOT_API_KEY", "dev-test-only");
  await getSql();
}, 30_000);
beforeEach(async () => {
  await q`DELETE FROM wp_players`;
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});

describe("daily ranked observations", () => {
  it("archives each observed queue once per UTC day and replaces it with the latest observation", async () => {
    let rank = [solo, flex];
    riotFixture(() => Response.json(rank));
    setTime("2026-11-23T13:00:00Z");
    await expect(lookup()).resolves.toMatchObject({ ok: true, source: "live" });
    const firstDay = renderToStaticMarkup(await PlayerRankHistory({ puuid, platform: "na1" }));
    expect(firstDay).toContain("One recorded day");
    expect(firstDay).not.toContain("<svg");
    rank = [{ ...solo, leaguePoints: 46 }, flex];
    setTime("2026-11-23T17:00:00Z");
    await expect(lookup()).resolves.toMatchObject({ ok: true, source: "live" });
    rank = [{ ...solo, leaguePoints: 65 }];
    setTime("2026-11-24T13:00:00Z");
    await expect(lookup()).resolves.toMatchObject({ ok: true, source: "live" });
    await expect(lookup()).resolves.toMatchObject({ ok: true, source: "cache" });

    const [soloHistory, flexHistory] = await readPlayerRankHistory(puuid, "na1");
    expect(soloHistory.recent).toMatchObject([{ day: "2026-11-23", lp: 46 }, { day: "2026-11-24", lp: 65 }]);
    expect(flexHistory.recent).toMatchObject([{ day: "2026-11-23", lp: 52 }]);
    expect(soloHistory.previousYears).toEqual([]);
    expect(JSON.stringify([soloHistory, flexHistory])).not.toContain(puuid);
    expect(await readPlayerRankHistory(puuid, "euw1")).toEqual([
      { queue: solo.queueType, recent: [], previousYears: [] },
      { queue: flex.queueType, recent: [], previousYears: [] },
    ]);
  });

  it("does not archive an unplaced queue, a failed rank result or a partially fetched core", async () => {
    let ranks: unknown = [];
    let rankStatus = 200;
    let listStatus = 200;
    riotFixture(() => Response.json(ranks, { status: rankStatus }), async () => Response.json([], { status: listStatus }));
    setTime("2026-11-23T13:00:00Z");
    await expect(lookup()).resolves.toMatchObject({ ok: true, source: "live" });
    expect(await q`SELECT queue FROM wp_rank_history`).toEqual([]);
    ranks = [solo];
    rankStatus = 502;
    setTime("2026-11-24T13:00:00Z");
    await expect(lookup()).resolves.toMatchObject({ ok: true, source: "stale" });
    rankStatus = 200;
    listStatus = 502;
    setTime("2026-11-25T13:00:00Z");
    await expect(lookup()).resolves.toMatchObject({ ok: true, source: "stale" });
    expect(await q`SELECT queue FROM wp_rank_history`).toEqual([]);
  });

  it("dates a rank that resolves after midnight using its own observation time", async () => {
    setTime("2026-11-23T23:59:59Z");
    riotFixture(() => {
      setTime("2026-11-24T00:00:01Z");
      return Response.json([solo]);
    });
    const result = await lookup();
    expect(result.ok && new Date(result.player.fetchedAt).toISOString()).toBe("2026-11-23T23:59:59.000Z");
    expect(await q`SELECT observed_day::text AS day FROM wp_rank_history`).toEqual([{ day: "2026-11-24" }]);
  });

  it("never records a stale concurrent response as a new historical day", async () => {
    let rank = solo;
    let firstList = true;
    const delayed = Promise.withResolvers<Response>();
    const listStarted = Promise.withResolvers<void>();
    riotFixture(() => Response.json([rank]), () => {
      if (!firstList) return Promise.resolve(Response.json([]));
      firstList = false;
      listStarted.resolve();
      return delayed.promise;
    });
    setTime("2026-11-23T13:00:00Z");
    const first = lookup("OriginalName");
    await listStarted.promise;
    await new Promise<void>(resolve => setImmediate(resolve));
    setTime("2026-11-24T13:00:00Z");
    rank = { ...solo, leaguePoints: 80 };
    try {
      await expect(lookup("UpdatedName")).resolves.toMatchObject({ ok: true, source: "live" });
    } finally {
      delayed.resolve(Response.json([]));
    }
    await expect(first).resolves.toMatchObject({ ok: true, source: "cache", player: { rankLp: 80 } });
    expect(await q`SELECT observed_day::text AS day, lp::int FROM wp_rank_history`).toEqual([{ day: "2026-11-24", lp: 80 }]);
  });

  it("rejects a later-started refresh when its rank is older than the saved observation", async () => {
    let rankCalls = 0;
    let listCalls = 0;
    const lateRank = Promise.withResolvers<Response>();
    const lateList = Promise.withResolvers<Response>();
    const firstRankStarted = Promise.withResolvers<void>();
    const secondListStarted = Promise.withResolvers<void>();
    riotFixture(() => {
      if (++rankCalls > 1) return Response.json([solo]);
      firstRankStarted.resolve();
      return lateRank.promise;
    }, () => {
      if (++listCalls === 1) return Promise.resolve(Response.json([]));
      secondListStarted.resolve();
      return lateList.promise;
    });
    setTime("2026-11-23T23:30:00Z");
    const first = lookup("EarlierRefresh");
    await firstRankStarted.promise;
    setTime("2026-11-23T23:45:00Z");
    const second = lookup("LaterRefresh");
    await secondListStarted.promise;
    await new Promise<void>(resolve => setImmediate(resolve));
    setTime("2026-11-24T00:01:00Z");
    lateRank.resolve(Response.json([{ ...solo, leaguePoints: 61 }]));
    try {
      await expect(first).resolves.toMatchObject({ ok: true, source: "live", player: { rankLp: 61 } });
    } finally {
      lateList.resolve(Response.json([]));
    }
    await expect(second).resolves.toMatchObject({ ok: true, source: "cache", player: { rankLp: 61 } });
    expect(await q`SELECT observed_day::text AS day, lp::int FROM wp_rank_history`).toEqual([{ day: "2026-11-24", lp: 61 }]);
  });

  it("rolls back the player snapshot if its matching history write fails", async () => {
    let rank = solo;
    riotFixture(() => Response.json([rank]));
    setTime("2026-11-23T13:00:00Z");
    await expect(lookup()).resolves.toMatchObject({ ok: true, source: "live" });
    await postgres.exec("ALTER TABLE wp_rank_history ADD CONSTRAINT rank_test_guard CHECK (lp <> 77)");
    setTime("2026-11-24T13:00:00Z");
    rank = { ...rank, leaguePoints: 77 };
    try {
      await expect(lookup()).rejects.toMatchObject({ code: "23514" });
      expect(await q`SELECT rank_lp FROM wp_players WHERE puuid=${puuid}`).toEqual([{ rank_lp: 30 }]);
      expect(await q`SELECT observed_day::text AS day FROM wp_rank_history`).toEqual([{ day: "2026-11-23" }]);
    } finally {
      await postgres.exec("ALTER TABLE wp_rank_history DROP CONSTRAINT rank_test_guard");
    }
    await q`DELETE FROM wp_players WHERE puuid=${puuid}`;
    expect(await q`SELECT queue FROM wp_rank_history`).toEqual([]);
  });
});

async function seedPoint(at: string, platform = "na1", rank = solo, playerId = puuid) {
  await q`INSERT INTO wp_rank_history (puuid,platform,queue,observed_day,tier,division,lp,wins,losses,captured_at)
    VALUES (${playerId},${platform},${rank.queueType},(${at}::timestamptz AT TIME ZONE 'UTC')::date,
    ${rank.tier},${rank.rank},${rank.leaguePoints},${rank.wins},${rank.losses},${at}::timestamptz)`;
}

describe("Riot-ranked-year boundaries", () => {
  beforeEach(async () => {
    await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line) VALUES (${puuid},'na1','Fixture','NA1')`;
  });

  it("uses the last recorded queue rank before an actual local rollover", async () => {
    await seedPoint("2026-01-01T10:00:00Z");
    await seedPoint("2026-01-08T07:59:00Z", "na1", { ...solo, leaguePoints: 61 });
    const euwPlayer = "euw-only-private-id";
    await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line) VALUES (${euwPlayer},'euw1','Fixture','EUW')`;
    await seedPoint("2026-01-08T07:59:00Z", "euw1", solo, euwPlayer);
    await seedPoint("2026-01-08T07:46:00Z", "na1", { ...flex, tier: "MASTER" });
    let [history] = await readPlayerRankHistory(puuid, "na1");
    expect(history.recent.map(point => point.year)).toEqual([2025, 2025]);
    expect(history.previousYears).toEqual([]);

    const before = renderToStaticMarkup(await PlayerRankHistory({ puuid, platform: "na1" }));
    expect(before).toContain('role="img" aria-label="Rank changes in Ranked Solo/Duo');
    expect(before).toContain("Recorded ranks");
    expect(before).toContain("<title>Jan 8, 2026 · Gold IV · 61 LP</title>");
    expect(before).not.toContain("Past ranked years");
    expect(before).not.toContain(puuid);

    await seedPoint("2026-01-09T00:00:00Z");
    await seedPoint("2026-01-10T00:00:00Z", "na1", flex);
    const [after, flexHistory] = await readPlayerRankHistory(puuid, "na1");
    expect(after.previousYears).toMatchObject([{ year: 2025, day: "2026-01-08", lp: 61 }]);
    expect(flexHistory.recent.map(point => point.year)).toEqual([null, 2026]);
    expect(flexHistory.previousYears).toEqual([]);
    const rendered = renderToStaticMarkup(await PlayerRankHistory({ puuid, platform: "na1" }));
    expect(rendered).toContain("Past ranked years in Ranked Solo/Duo");
    expect(rendered).not.toContain("Past ranked years in Ranked Flex");
    expect(rendered).toContain("Separate lines mark ranked years.");
    [history] = await readPlayerRankHistory(euwPlayer, "euw1");
    expect(history.recent.map(point => point.year)).toEqual([null]);
    expect(history.previousYears).toEqual([]);
  });

  it("does not use reward-split changes or an unpublished rollover as ranked-year history", async () => {
    await seedPoint("2026-04-28T17:00:00Z");
    await seedPoint("2026-07-29T17:00:00Z");
    await seedPoint("2027-01-01T17:00:00Z");
    const [history] = await readPlayerRankHistory(puuid, "na1");
    expect(history.recent.map(point => point.year)).toEqual([2026, 2026, null]);
    expect(history.previousYears).toEqual([]);
  });
});

it("plots a promotion upward even when the displayed LP resets to a lower number", () => {
  const point: RankHistoryPoint = { day: "2026-11-23", year: 2026, tier: "SILVER", division: "I", lp: 98, wins: 5, losses: 2 };
  const promoted = { ...point, tier: "GOLD", division: "IV", lp: 10 } as const;
  expect(rankHistoryPosition(promoted)).toBeGreaterThan(rankHistoryPosition(point));
  expect(rankHistoryPosition({ ...promoted, tier: "GRANDMASTER" }))
    .toBe(rankHistoryPosition({ ...promoted, tier: "MASTER" }));
});

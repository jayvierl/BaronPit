import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { readRiotTimeline } from "./riot";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));

beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/riot-timeline");
  await q`SELECT 1`;
}, 30_000);
afterEach(async () => {
  vi.unstubAllGlobals();
  await q`DELETE FROM wp_action_windows WHERE bucket LIKE 'riot:%'`;
});
afterAll(async () => { vi.unstubAllEnvs(); await postgres.close(); });

it("uses the exact Match-V5 regional timeline routes and admits eight total requests across concurrent regions", async () => {
  vi.stubEnv("RIOT_API_KEY", "timeline-route-fixture");
  const matches = [
    ["NA1_101", "americas"], ["EUW1_102", "europe"], ["KR_103", "asia"], ["OC1_104", "sea"],
    ["BR1_105", "americas"], ["TR1_106", "europe"], ["JP1_107", "asia"], ["LA1_108", "americas"],
  ];
  const vendor = vi.fn(async (url: string, init: RequestInit) => {
    expect(new Headers(init.headers).get("x-riot-token")).toBe("timeline-route-fixture");
    expect(init.cache).toBe("no-store");
    return Response.json({ matchPath: new URL(url).pathname });
  });
  vi.stubGlobal("fetch", vendor);

  const received = await Promise.all(matches.map(([id]) => readRiotTimeline(id)));
  expect(received).toEqual(matches.map(([id]) => ({ status: 200, body: { matchPath: `/lol/match/v5/matches/${id}/timeline` } })));
  expect(vendor.mock.calls.map(([url]) => url).sort()).toEqual(matches.map(([id, cluster]) =>
    `https://${cluster}.api.riotgames.com/lol/match/v5/matches/${id}/timeline`).sort());
  expect(await readRiotTimeline("EUW1_109")).toEqual({ status: 429, body: null });
  expect(await q`SELECT cardinality(hits) AS n FROM wp_action_windows WHERE bucket='riot:public-timelines'`).toEqual([{ n: 8 }]);
  expect(vendor).toHaveBeenCalledTimes(8);
});

it("persists Riot's Retry-After delay and shares it across warm and cold regions", async () => {
  const key = "timeline-cooldown-fixture";
  vi.stubEnv("RIOT_API_KEY", key);
  const vendor = vi.fn(async () => new Response(null, { status: 429, headers: { "Retry-After": "125" } }));
  vi.stubGlobal("fetch", vendor);
  expect(await readRiotTimeline("NA1_201")).toEqual({ status: 429, body: null });
  expect(await readRiotTimeline("EUW1_202")).toEqual({ status: 429, body: null });
  const bucket = "riot:cooldown:" + createHash("sha256").update(key).digest("hex");
  const [cooldown] = await q`SELECT extract(epoch FROM expires_at-now())::double precision AS seconds
    FROM wp_action_windows WHERE bucket=${bucket}`;
  expect(Number(cooldown?.seconds)).toBeGreaterThan(120);
  expect(Number(cooldown?.seconds)).toBeLessThanOrEqual(125);

  vi.resetModules();
  const cold = await import("./riot");
  expect(await cold.readRiotTimeline("OC1_203")).toEqual({ status: 429, body: null });
  expect(vendor).toHaveBeenCalledTimes(1);
  expect(await q`SELECT cardinality(hits) AS n FROM wp_action_windows WHERE bucket='riot:public-timelines'`).toEqual([{ n: 1 }]);

  await q`UPDATE wp_action_windows SET expires_at=now()-interval '1 second' WHERE bucket=${bucket}`;
  vendor.mockResolvedValueOnce(Response.json({ metadata: { matchId: "OC1_203" } }));
  expect(await cold.readRiotTimeline("OC1_203")).toMatchObject({ status: 200 });
  expect(vendor).toHaveBeenCalledTimes(2);
});

it("makes no vendor request and consumes no timeline capacity with missing credentials or an unsupported match", async () => {
  vi.stubEnv("RIOT_API_KEY", "");
  const vendor = vi.fn();
  vi.stubGlobal("fetch", vendor);
  expect(await readRiotTimeline("NA1_301")).toEqual({ status: 503, body: null });
  vi.stubEnv("RIOT_API_KEY", "timeline-unsupported-fixture");
  for (const id of ["UNKNOWN_301", "NA1_301/timeline", "na1_301"]) {
    expect(await readRiotTimeline(id)).toEqual({ status: 503, body: null });
  }
  expect(vendor).not.toHaveBeenCalled();
  expect(await q`SELECT bucket FROM wp_action_windows WHERE bucket='riot:public-timelines'`).toEqual([]);
});

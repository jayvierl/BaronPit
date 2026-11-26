import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { duoFitReasons, parseDuoFit, type DuoFit } from "./duo-fit";
import { encodeWindows, overlaps, scheduleWindows, sharedWindows, timeZoneName } from "./duo-schedule";
import { loadDuoFit, saveDuoFit } from "./duo-fit-store";
import { q } from "./db";
import { getCurrentUser, type User } from "./auth";
import { readDuoBoard } from "./duo";
import { sessionOptions, sessionWindow, RANKED_QUEUE } from "./duo-session";
import { SCHEDULE_BLOCKS } from "./pure";
import { TERMS_VERSION } from "./account-policy";
import { POST } from "../app/api/lfg/preferences/route";
import { POST as selectPrimary } from "../app/api/account/primary/route";
import { privateDuoReadiness } from "./duo-readiness";

vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../test/postgres")).neonForTests,
}));
vi.mock("./auth", async load => ({
  ...(await load<typeof import("./auth")>()), getCurrentUser: vi.fn(), rateLimit: vi.fn(async () => true),
}));

const fit: DuoFit = { role: "Support", partnerRole: "ADC", timeZone: "UTC", blocks: ["Weekend mornings"], vibe: "chill", communication: "text" };
const request = (body: unknown, origin = "https://ward.test") => new Request("https://ward.test/api/lfg/preferences", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/fit");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at,created_at)
    SELECT i,'u'||i||'@ward.invalid','Player',CASE WHEN i=5 THEN 'teen' ELSE 'adult' END,
      ${TERMS_VERSION},now(),now()-interval '2 days' FROM generate_series(1,5) i`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,rank_div,snapshot)
    SELECT 'account-'||i,'na1','Riot'||i,'NA1','GOLD','II','{"matches":[{"matchId":"NA1_20"}]}'::jsonb
    FROM generate_series(1,5) i`;
  await q`INSERT INTO wp_links(user_id,puuid,verified)
    SELECT i,'account-'||i,i<>4 FROM generate_series(1,5) i`;
}, 30000);
afterAll(async () => { vi.unstubAllEnvs(); await postgres.close(); });

it("accepts structured partner choices, resolves Fill and allows any schedule without personal text", () => {
  expect(parseDuoFit({ ...fit, note: "private", userId: 1 })).toEqual(fit);
  expect(parseDuoFit({ ...fit, partnerRole: "@external" })).toBeNull();
  expect(parseDuoFit({ ...fit, blocks: ["Weekend mornings", "Weekend mornings"] })).toBeNull();
  expect(parseDuoFit({ ...fit, blocks: [] })).toMatchObject({ blocks: [] });
  expect(duoFitReasons(fit, { roles: ["Fill"], partnerRole: "Support", vibe: "both", voice: false }, true))
    .toEqual(["Can fill ADC", "Looking for Support", "Overlapping play times", "Flexible playstyle", "Text only"]);
});
it("compares real instants across DST gaps, folds, fractional offsets and day boundaries", () => {
  const intervals = (date: string) => scheduleWindows(["Weekend late nights"], "America/Chicago", Date.parse(date), 1)
    .map(([start,end]) => [start,end].map(t => new Date(t * 900_000).toISOString().slice(11,16)));
  expect(intervals("2026-03-08T00:00:00Z")).toEqual([["06:00","11:00"]]);
  expect(intervals("2026-11-01T00:00:00Z")).toEqual([["05:00","12:00"]]);
  const friday = Date.parse("2026-03-06T13:00:00Z");
  const [kathmandu] = scheduleWindows(["Weekend late nights"], "Asia/Kathmandu", friday, 1);
  expect(new Date(kathmandu[0] * 900_000).toISOString()).toBe("2026-03-06T18:15:00.000Z");
  expect(overlaps([kathmandu], scheduleWindows(["Weekday evenings"], "UTC", friday, 1))).toBe(true);
  expect(overlaps([[0,5]],[[5,9]])).toBe(false);
  expect(sharedWindows([[0,5],[9,11]],[[2,10]])).toEqual([[2,5],[9,10]]);
  expect(timeZoneName("Not/AZone")).toBeNull();
  expect(timeZoneName("CST")).toBeNull();
  expect(parseDuoFit({...fit,timeZone:"Invalid/Zone"})).toBeNull();
});
it("saves private intent during a matching pause, scopes writes to the session, and supports private deletion", async () => {
  vi.stubEnv("DUO_MATCHING_ENABLED", "false");
  const body = { action: "save", ...fit, userId: 1, note: "@external" };
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await POST(request(body))).status).toBe(401);
  const user = { id: 4, termsCurrent: true, bannedUntil: null } as User;
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  expect((await POST(request(body, "https://other.invalid"))).status).toBe(403);
  expect((await POST(request(body))).status).toBe(200);
  expect(await loadDuoFit(4)).toEqual(fit);
  expect(await loadDuoFit(1)).toBeNull();
  expect(await readDuoBoard(4, true)).toEqual({ listings: [], requests: [] });
  expect(await q`SELECT id FROM wp_lfg`).toHaveLength(0);
  vi.mocked(getCurrentUser).mockResolvedValue({ ...user, bannedUntil: "2099-01-01" });
  expect((await POST(request(body))).status).toBe(403);
  expect((await POST(request({ action: "clear" }))).status).toBe(200);
  expect(await loadDuoFit(4)).toBeNull();
});
it("filters before the listing limit, preserves a player's own controls, and enforces same age and bilateral mute", async () => {
  vi.stubEnv("DUO_MATCHING_ENABLED", "true");
  const withinSession = {...fit, blocks:[...SCHEDULE_BLOCKS]};
  await saveDuoFit(1, withinSession);
  const asOf = Date.now();
  const start = sessionOptions(asOf)[1];
  const [slot,end] = sessionWindow(start);
  const available = encodeWindows([[slot,end]]);
  await q`INSERT INTO wp_lfg(user_id,puuid,roles,blocks,vibe,voice,safe_listing)
    VALUES(1,'account-1',ARRAY['Support'],ARRAY['Weekday mornings'],'chill',true,true),
      (2,'account-2',ARRAY['Fill'],ARRAY['Weekend mornings'],'both',false,true),
      (5,'account-5',ARRAY['ADC'],ARRAY['Weekend mornings'],'chill',false,true)`;
  // Place an eligible session behind forty later nonmatching listings.
  await q`INSERT INTO wp_lfg(user_id,puuid,roles,vibe,voice,safe_listing)
    SELECT 3,'account-3',ARRAY['Mid'],'tryhard',true,true FROM generate_series(1,41)`;
  await q`UPDATE wp_lfg SET partner_role='Support',session_start=${new Date(start).toISOString()},session_queue=${RANKED_QUEUE},
    play_windows=${available}::int4multirange WHERE user_id<>1`;
  await q`INSERT INTO wp_lfg(user_id,puuid,roles,partner_role,play_windows,vibe,voice,safe_listing,session_start,session_queue)
    VALUES(3,'account-3',ARRAY['ADC'],'Jungle',${available}::int4multirange,'chill',false,true,${new Date(start).toISOString()},${RANKED_QUEUE}),
      (3,'account-3',ARRAY['ADC'],'Support',NULL,'chill',false,true,NULL,NULL)`;
  const eligible = await readDuoBoard(1, true, asOf);
  expect(eligible.listings).toHaveLength(2);
  expect(eligible.listings.map(l => l.roles)).toEqual([["Support"], ["Fill"]]);
  expect((await readDuoBoard(1)).listings).toHaveLength(40);
  await saveDuoFit(1, {...withinSession, role:"Fill"});
  expect((await readDuoBoard(1, true, asOf)).listings.filter(l => !l.own).map(l => l.partnerRole).sort())
    .toEqual(["Jungle","Support"]);
  // An older plan can still be read and edited. Without its zone it cannot prove overlapping hours.
  await saveDuoFit(1, {...fit, timeZone:undefined});
  expect((await loadDuoFit(1))?.timeZone).toBeUndefined();
  expect((await readDuoBoard(1, true, asOf)).listings.every(l => l.own)).toBe(true);
  await saveDuoFit(1, withinSession);
  expect((await readDuoBoard(4, true)).listings).toHaveLength(0);
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES(2,1)`;
  expect((await readDuoBoard(1, true, asOf)).listings.map(l => l.roles)).toEqual([["Support"]]);
  expect((await readDuoBoard(2)).listings.every(l => !l.roles.includes("Support"))).toBe(true);
});

it("uses the player's selected verified account and keeps others' accounts private", async () => {
  const viewer = { id: 1, termsCurrent: true, bannedUntil: null } as User;
  vi.mocked(getCurrentUser).mockResolvedValue(viewer);
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,snapshot)
    VALUES('primary-euw','euw1','Europe','EUW','GOLD','{"matches":[{"matchId":"EUW1_a"}]}')`;
  await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES(1,'primary-euw',true)`;
  expect((await selectPrimary(request({puuid:"account-2"}))).status).toBe(400);
  expect((await selectPrimary(request({puuid:"primary-euw"}))).status).toBe(200);
  expect(await privateDuoReadiness(1)).toMatchObject({ready:false,regionOutsidePilot:true});
  expect((await selectPrimary(request({puuid:"account-1"}))).status).toBe(200);
  expect(await privateDuoReadiness(1)).toEqual({ready:true,riotId:"Riot1#NA1",rankedPilot:true});
  expect(await q`SELECT puuid FROM wp_links WHERE user_id=1 AND is_primary`).toEqual([{puuid:"account-1"}]);
});

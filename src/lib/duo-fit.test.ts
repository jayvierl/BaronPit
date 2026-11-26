import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { duoFitReasons, parseDuoFit, type DuoFit } from "./duo-fit";
import { loadDuoFit, saveDuoFit } from "./duo-fit-store";
import { q } from "./db";
import { getCurrentUser, type User } from "./auth";
import { readDuoBoard } from "./duo";
import { TERMS_VERSION } from "./account-policy";
import { POST } from "../app/api/lfg/preferences/route";

vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../test/postgres")).neonForTests,
}));
vi.mock("./auth", async load => ({
  ...(await load<typeof import("./auth")>()), getCurrentUser: vi.fn(), rateLimit: vi.fn(async () => true),
}));

const fit: DuoFit = { role: "Support", partnerRole: "ADC", blocks: ["Weekend mornings"], vibe: "chill", communication: "text" };
const request = (body: unknown, origin = "https://ward.test") => new Request("https://ward.test/api/lfg/preferences", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/fit");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at,created_at)
    SELECT i,'u'||i||'@ward.invalid','Player',CASE WHEN i=5 THEN 'teen' ELSE 'adult' END,
      ${TERMS_VERSION},now(),now()-interval '2 days' FROM generate_series(1,5) i`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,snapshot)
    SELECT 'account-'||i,'na1','Riot'||i,'NA1','GOLD','{"matches":[{"matchId":"NA1_20"}]}'::jsonb
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
  expect(duoFitReasons(fit, { roles: ["Fill"], blocks: ["Weekend mornings"], vibe: "both", voice: false }))
    .toEqual(["Can fill ADC", "Weekend mornings", "Flexible playstyle", "Text only"]);
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
  await saveDuoFit(1, fit);
  await q`INSERT INTO wp_lfg(user_id,puuid,roles,blocks,vibe,voice,safe_listing)
    VALUES(1,'account-1',ARRAY['Support'],ARRAY['Weekday mornings'],'chill',true,true),
      (2,'account-2',ARRAY['Fill'],ARRAY['Weekend mornings'],'both',false,true),
      (5,'account-5',ARRAY['ADC'],ARRAY['Weekend mornings'],'chill',false,true)`;
  // Fill the page with more recent non-matching listings, leaving an older eligible listing behind them.
  await q`INSERT INTO wp_lfg(user_id,puuid,roles,blocks,vibe,voice,safe_listing)
    SELECT 3,'account-3',ARRAY['Mid'],ARRAY['Weekend evenings'],'tryhard',true,true FROM generate_series(1,41)`;
  const eligible = await readDuoBoard(1, true);
  expect(eligible.listings).toHaveLength(2);
  expect(eligible.listings.map(l => l.roles)).toEqual([["Support"], ["Fill"]]);
  expect((await readDuoBoard(1)).listings).toHaveLength(40);
  expect((await readDuoBoard(4, true)).listings).toHaveLength(0);
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES(2,1)`;
  expect((await readDuoBoard(1, true)).listings.map(l => l.roles)).toEqual([["Support"]]);
  expect((await readDuoBoard(2)).listings.every(l => !l.roles.includes("Support"))).toBe(true);
});

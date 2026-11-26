import {afterAll,beforeAll,beforeEach,expect,it,vi} from "vitest";
import {postgres} from "../../test/postgres";
import {TERMS_VERSION} from "./account-policy";
import {q} from "./db";
import {clearExpiredPilotData,leavePilot} from "./pilot";
import {duoPilotResults,duoPilotState,duoPilotWindows,enrollDuoPilot,withdrawDuoPilot} from "./duo-pilot";

vi.mock("@neondatabase/serverless",async()=>({neon:(await import("../../test/postgres")).neonForTests}));

beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","postgresql://fixture.invalid/duo-pilot");
  vi.stubEnv("VERCEL_ENV","development");
  vi.stubEnv("ADMIN_EMAILS","player7@study.local");
  vi.stubEnv("PILOT_FIXTURE_EMAILS","player8@study.local");
  await q`SELECT 1`;
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at,created_at)
    SELECT n,'player'||n||'@study.local','Player '||n,'adult',${TERMS_VERSION},now(),now()-interval '60 days' FROM generate_series(1,10) n`;
  await q`UPDATE wp_users SET email='fixture@sample.invalid' WHERE id=9`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,snapshot)
    SELECT 'riot-'||n,'na1','Player '||n,'NA1','GOLD',
    jsonb_build_object('matches',jsonb_build_array(jsonb_build_object('matchId','match','startedAt',floor(extract(epoch FROM now()-interval '2 hours')*1000)::bigint,'playedAt',
    floor(extract(epoch FROM now()-interval '1 hour')*1000)::bigint,
    'teammates',CASE WHEN n=1 THEN '[{"name":"Player 2","tag":"NA1"}]'::jsonb WHEN n=2 THEN '[{"name":"Player 1","tag":"NA1"}]'::jsonb ELSE '[]'::jsonb END)))
    FROM generate_series(1,10) n`;
  await q`INSERT INTO wp_links(user_id,puuid,is_primary,verified) SELECT n,'riot-'||n,true,n<>10 FROM generate_series(1,10) n`;
  await q`INSERT INTO wp_lfg(id,user_id,puuid,safe_listing,created_at)
    SELECT n,n,'riot-'||n,true,now()-interval '3 days' FROM generate_series(1,10) n`;
  // Requests 1→2 and 2→1 count as one pair. Only player 1 has a verified teammate match with 2.
  await q`INSERT INTO wp_duo_requests(listing_id,sender_id,sender_puuid,status,created_at,accepted_at)
    SELECT owner_id,sender_id,'riot-'||sender_id,'accepted',now()-interval '2 days',now()-interval '47 hours'
    FROM (VALUES (2,1),(1,2),(3,2),(4,5),(7,5),(8,6),(9,6)) AS ids(owner_id,sender_id)`;
},30000);
beforeEach(async()=>{
  vi.stubEnv("DUO_MATCHING_ENABLED","true");
  await q`DELETE FROM wp_duo_pilot_members`;
  await q`UPDATE wp_duo_requests SET sender_requeue=false,owner_requeue=false`;
});
afterAll(async()=>{await postgres.close();vi.unstubAllEnvs();});

it("requires independent eligible verification and active matching; retrying enrollment preserves its window",async()=>{
  vi.stubEnv("DUO_MATCHING_ENABLED","false");
  expect(await enrollDuoPilot(1)).toBe(false);
  vi.stubEnv("DUO_MATCHING_ENABLED","true");
  for(const id of [7,8,9,10]) expect(await enrollDuoPilot(id)).toBe(false);
  expect(await enrollDuoPilot(1)).toBe(true);
  const start=await duoPilotState(1);
  expect(await enrollDuoPilot(1)).toBe(true);
  expect(await duoPilotState(1)).toBe(start);
  expect(await duoPilotResults()).toMatchObject({enrolled:1,pairs:0,listed:0,sent:0});
});

it("deduplicates pairs in either direction, counts distinct people, and keeps one-sided actions unpaired",async()=>{
  await q`INSERT INTO wp_duo_pilot_members SELECT n,now()-interval '5 days',2 FROM generate_series(1,3) n`;
  await q`INSERT INTO wp_duo_pilot_members VALUES (5, now()-interval '5 days',2),(6, now()-interval '5 days',2)`;
  expect(await duoPilotResults()).toEqual({enrolled:5,listed:5,sent:3,acceptedInvites:3,
    pairs:2,pairedPeople:3,accepted:2,acceptedRequests:3,medianAcceptanceMinutes:60,acceptedPeople:3,played:1,playedPeople:2,mutual:0,mutualPeople:0,
    maturePlayed:0,observedRepeat:0,repeatUnknown:0});
  await q`UPDATE wp_duo_requests SET sender_requeue=true WHERE listing_id=2 AND sender_id=1`;
  expect(await duoPilotResults()).toMatchObject({played:1,mutual:0});
  await q`UPDATE wp_duo_requests SET owner_requeue=true WHERE listing_id=2 AND sender_id=1`;
  expect(await duoPilotResults()).toMatchObject({mutual:1,mutualPeople:2});
  await withdrawDuoPilot(2);
  expect(await duoPilotResults()).toMatchObject({enrolled:4,pairs:0,pairedPeople:0,mutual:0,sent:2,acceptedInvites:2});
});

it("enforces the rolling cutoff and forbids pre-consent pair tracking, including after rejoining",async()=>{
  await q`INSERT INTO wp_duo_pilot_members VALUES (1,now()-interval '14 days',2),(2,now()-interval '14 days',2)`;
  await q`UPDATE wp_duo_requests SET created_at=now()-interval '8 days' WHERE (listing_id,sender_id) IN ((1,2),(2,1))`;
  try { expect(await duoPilotResults()).toMatchObject({pairs:0}); }
  finally { await q`UPDATE wp_duo_requests SET created_at=now()-interval '2 days' WHERE (listing_id,sender_id) IN ((1,2),(2,1))`; }
  await leavePilot(1);
  expect(await enrollDuoPilot(1)).toBe(true);
  expect(await duoPilotResults()).toMatchObject({enrolled:2,pairs:0});
  await q`UPDATE wp_duo_pilot_members SET joined_at=now()-interval '29 days' WHERE user_id=2`;
  expect(await duoPilotState(2)).toBeNull();
  expect(await duoPilotResults()).toMatchObject({enrolled:1});
  await clearExpiredPilotData();
  expect(await q`SELECT user_id FROM wp_duo_pilot_members`).toEqual([{user_id:1}]);
  const cols=await q`SELECT column_name FROM information_schema.columns WHERE table_name='wp_duo_pilot_members' ORDER BY column_name`;
  expect(cols.map(r=>r.column_name)).toEqual(["joined_at","study_version","user_id"]);
});

it("keeps pending requests in the denominator and rejects games played before acceptance", async () => {
  await q`INSERT INTO wp_duo_pilot_members SELECT n,now()-interval '5 days',2 FROM generate_series(1,3) n`;
  await q`UPDATE wp_duo_requests SET status='pending',accepted_at=NULL WHERE listing_id=3`;
  await q`UPDATE wp_duo_requests SET accepted_at=now() WHERE (listing_id,sender_id) IN ((1,2),(2,1))`;
  try {
    expect(await duoPilotResults()).toMatchObject({pairs:2,accepted:1,played:0,mutual:0});
  } finally {
    await q`UPDATE wp_duo_requests SET status='accepted',accepted_at=now()-interval '47 hours'`;
  }
});

it("compares a fixed UTC week with at least seven days of follow-up, excluding the end boundary and newer pairs", async () => {
  expect(duoPilotWindows(new Date("2026-11-26T15:00:00Z")).mature).toMatchObject({
    start: "2026-11-09T00:00:00.000Z", end: "2026-11-16T00:00:00.000Z",
  });
  const window = duoPilotWindows().mature;
  await q`INSERT INTO wp_duo_pilot_members SELECT n,now()-interval '25 days',2 FROM generate_series(1,3) n`;
  await q`UPDATE wp_duo_requests SET created_at=${window.start},accepted_at=${window.end}::timestamptz+interval '2 hours'
    WHERE listing_id=2 AND sender_id=1`;
  await q`UPDATE wp_duo_requests SET created_at=${window.end} WHERE listing_id=3 AND sender_id=2`;
  try {
    const older = await duoPilotResults(window);
    expect(older).toMatchObject({pairs:1,accepted:1,pairedPeople:2,sent:1,acceptedInvites:1});
    // The recent reversed request counts in the current cohort and cannot introduce another old pair.
    expect(await duoPilotResults()).toMatchObject({pairs:1,pairedPeople:2,sent:1});
  } finally {
    await q`UPDATE wp_duo_requests SET created_at=now()-interval '2 days',accepted_at=now()-interval '47 hours'`;
  }
});

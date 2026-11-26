import {afterAll, beforeAll, beforeEach, expect, it, vi} from "vitest";
import {postgres} from "../../test/postgres";
import {TERMS_VERSION} from "./account-policy";
import {q} from "./db";
import type { User } from "./auth";
import { endorse } from "./relationships";
import {checkDuoGame, privateGameChecks, clearExpiredGameChecks} from "./duo-game-check";
import {duoPilotResults, duoPilotState} from "./duo-pilot";
import {DUO_STUDY_VERSION} from "./duo-study-version";

const lookup = vi.hoisted(()=>vi.fn());
vi.mock("./riot",()=>({lookupPlayer:lookup}));
vi.mock("@neondatabase/serverless",async()=>({neon:(await import("../../test/postgres")).neonForTests}));
const day=86400000;
const first=Date.parse(new Date(Date.now()-10*day).toISOString().slice(0,10)+"T12:00:00Z");
const accepted=first-3600000;
const window={start:new Date(accepted-day).toISOString(),end:new Date(accepted+day).toISOString(),label:"Fixture week",current:false};

function snapshot(player:number, times:(number|null)[], visible=true, coverageFrom:number|undefined=0) {
  return {coverageFrom,coverageThrough:Math.max(...times.map(time=>(time||accepted)+2*3600000)),matches:times.map((startedAt,index)=>({matchId:"NA1_"+(startedAt||index),startedAt,
    playedAt:(startedAt||accepted)+2*3600000,teammates:visible?[{name:"Player "+(player===1?2:1),tag:"NA1"}]:[]}))};
}
async function setSnapshots(times:(number|null)[], blindOwner=false, coverageFrom=0) {
  for (const player of [1,2]) await q`UPDATE wp_players SET fetched_at=now(),
    snapshot=${JSON.stringify(snapshot(player,times,player!==2||!blindOwner,coverageFrom))}::jsonb
    WHERE puuid=${"id-"+player}`;
}
beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","postgresql://fixture.invalid/game-check");
  vi.stubEnv("VERCEL_ENV","development");
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at,created_at)
    SELECT n,'duo'||n||'@study.local','Player','adult',${TERMS_VERSION},now(),now()-interval '40 days' FROM generate_series(1,3)n`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier)
    SELECT 'id-'||n,'na1','Player '||n,'NA1','GOLD' FROM generate_series(1,3)n`;
  await q`INSERT INTO wp_links(user_id,puuid,verified) SELECT n,'id-'||n,true FROM generate_series(1,3)n`;
  await q`INSERT INTO wp_lfg(id,user_id,puuid,safe_listing,expires_at) VALUES(1,2,'id-2',true,now()-interval '10 days')`;
  await q`INSERT INTO wp_duo_requests(id,listing_id,sender_id,sender_puuid,status,created_at,accepted_at)
    VALUES(1,1,1,'id-1','accepted',${new Date(accepted-1000).toISOString()},${new Date(accepted).toISOString()})`;
},30000);
beforeEach(async()=>{
  vi.stubEnv("DUO_MATCHING_ENABLED","true");
  lookup.mockReset().mockImplementation(async (_platform:string,name:string)=>({ok:true,source:"cache",player:{puuid:"id-"+name.slice(-1)}}));
  await q`TRUNCATE wp_duo_game_checks,wp_mutes,wp_reports,wp_endorsements,wp_action_windows,wp_duo_pilot_members CASCADE`;
  await q`INSERT INTO wp_duo_pilot_members(user_id,joined_at,study_version)
    SELECT n,now()-interval '20 days',${DUO_STUDY_VERSION} FROM generate_series(1,2)n`;
  await setSnapshots([first]);
});
afterAll(async()=>{vi.unstubAllEnvs();await postgres.close();});

it("requires accepted participants, rechecks both identities after refresh and deduplicates their concurrent calls",async()=>{
  expect(await checkDuoGame(3,1)).toMatchObject({ok:false});
  await q`INSERT INTO wp_mutes VALUES (2,1,now())`;
  expect(await checkDuoGame(1,1)).toMatchObject({ok:false});
  expect(await privateGameChecks(2)).toEqual([]);
  await q`DELETE FROM wp_mutes`;
  expect(lookup).not.toHaveBeenCalled();
  const results=await Promise.all([checkDuoGame(1,1),checkDuoGame(2,1)]);
  expect(results.filter(r=>r.ok)).toHaveLength(1);
  expect(lookup).toHaveBeenCalledTimes(2);
  await q`INSERT INTO wp_lfg(id,user_id,puuid,safe_listing) VALUES(8,1,'id-1',true)`;
  await q`INSERT INTO wp_duo_requests(id,listing_id,sender_id,sender_puuid,status,accepted_at)
    VALUES(8,8,2,'id-2','accepted',now()-interval '2 hours')`;
  expect(await checkDuoGame(2,8)).toMatchObject({ok:false,status:429});
  expect(lookup).toHaveBeenCalledTimes(2);
  await q`DELETE FROM wp_lfg WHERE id=8`;
  expect(await privateGameChecks(2)).toMatchObject([{requestId:1,firstGameAt:new Date(first).toISOString(),repeatGameAt:null}]);
  expect(JSON.stringify(await privateGameChecks(1))).not.toMatch(/id-1|id-2|Player 2|NA1_/);
  await q`DELETE FROM wp_duo_game_checks`;
  lookup.mockImplementationOnce(async()=>{await q`INSERT INTO wp_reports(reporter_id,target_kind,target_id) VALUES (2,'duo_request',1)`;return {ok:true,source:"live",player:{puuid:"id-1"}};});
  expect(await checkDuoGame(1,1)).toMatchObject({ok:false});
  expect(await privateGameChecks(2)).toEqual([]);
  expect(await q`SELECT first_game_at FROM wp_duo_game_checks`).toEqual([{first_game_at:null}]);
});

it("does not use end time, infer a hidden teammate, or count twice on the same UTC date",async()=>{
  for (const [times,blind,firstExpected] of [
    [[accepted-1000,accepted,null],false,null],
    [[first],true,null],
    [[first,first+3600000,first+8*day],false,new Date(first).toISOString()]
  ] as const) {
    await setSnapshots([...times],blind);
    await q`DELETE FROM wp_duo_game_checks`;
    expect(await checkDuoGame(1,1)).toMatchObject({ok:true});
    expect(await privateGameChecks(1)).toMatchObject([{firstGameAt:firstExpected,repeatGameAt:null}]);
  }
});

it("preserves observed first and later-day repeat without a match archive and removes outcomes on expiry",async()=>{
  expect(await checkDuoGame(1,1)).toMatchObject({ok:true});
  await q`UPDATE wp_duo_game_checks SET attempted_at=now()-interval '11 minutes'`;
  // Only the later-day game remains in the current profiles.
  await setSnapshots([first+2*day]);
  expect(await checkDuoGame(2,1)).toMatchObject({ok:true});
  expect(await privateGameChecks(1)).toMatchObject([{firstGameAt:new Date(first).toISOString(),repeatGameAt:new Date(first+2*day).toISOString()}]);
  expect(await duoPilotResults(window)).toMatchObject({accepted:1,played:1,maturePlayed:1,observedRepeat:1,repeatUnknown:0,mutual:0});
  await q`UPDATE wp_duo_pilot_members SET study_version=1 WHERE user_id=1`;
  expect(await duoPilotState(1)).toBeNull();
  expect(await duoPilotResults(window)).toMatchObject({pairs:0,played:0,observedRepeat:0});
  await q`UPDATE wp_duo_game_checks SET expires_at=now()-interval '1 second'`;
  await clearExpiredGameChecks();
  expect(await q`SELECT request_id FROM wp_duo_game_checks`).toEqual([]);
});

it("keeps incomplete coverage unknown and retains previous successful evidence on a provider failure",async()=>{
  await setSnapshots([first],false,first+day);
  expect(await checkDuoGame(1,1)).toMatchObject({ok:true});
  expect(await duoPilotResults(window)).toMatchObject({maturePlayed:1,observedRepeat:0,repeatUnknown:1});
  await q`UPDATE wp_duo_game_checks SET attempted_at=now()-interval '11 minutes'`;
  lookup.mockResolvedValue({ok:true,source:"stale",player:{puuid:"id-1"}});
  expect(await checkDuoGame(1,1)).toMatchObject({ok:false});
  expect(await privateGameChecks(1)).toMatchObject([{firstGameAt:new Date(first).toISOString()}]);
  await q`UPDATE wp_players SET fetched_at=now()-interval '26 hours' WHERE puuid='id-1'`;
  expect(await privateGameChecks(1)).toHaveLength(1);
  vi.stubEnv("DUO_MATCHING_ENABLED","false");
  expect(await privateGameChecks(1)).toEqual([]);
  expect(await checkDuoGame(1,1)).toMatchObject({ok:false});
});

it("requires the same post-acceptance proof and safety gates for teammate endorsements",async()=>{
  const from = {id:1} as User;
  await setSnapshots([accepted-1000]);
  expect(await endorse(from,2,"good_teammate")).toMatchObject({ok:false});
  await setSnapshots([first]);
  await q`INSERT INTO wp_mutes VALUES(2,1,now())`;
  expect(await endorse(from,2,"good_teammate")).toMatchObject({ok:false});
  await q`DELETE FROM wp_mutes`;
  expect(await endorse(from,2,"good_teammate")).toMatchObject({ok:true});
});

it("requires closed, contiguous Riot history before treating an unobserved repeat as covered",async()=>{
  expect(await checkDuoGame(1,1)).toMatchObject({ok:true});
  expect(await duoPilotResults(window)).toMatchObject({repeatUnknown:1});
  await q`UPDATE wp_duo_game_checks SET attempted_at=now()-interval '11 minutes'`;
  // A later observed game beyond the seven-day boundary closes the completed history window.
  await setSnapshots([first,first+8*day]);
  expect(await checkDuoGame(2,1)).toMatchObject({ok:true});
  expect(await duoPilotResults(window)).toMatchObject({maturePlayed:1,observedRepeat:0,repeatUnknown:0});
});

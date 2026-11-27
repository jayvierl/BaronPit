import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { q } from "./db";
import { TERMS_VERSION } from "./account-policy";
import { DUO_STUDY_VERSION } from "./duo-study-version";
import { postgres } from "../../test/postgres";
import { arrivalConsent, clearEveningChoice, eveningChoice, eveningTotals, proposedEvening, recordFitBoardDay, saveEveningChoice, setArrivalConsent } from "./duo-evening";
import { readDuoBoard } from "./duo";
import { leavePilot } from "./pilot";
import { clearExpiredPilotData } from "./pilot";

vi.mock("@neondatabase/serverless",async()=>({neon:(await import("../../test/postgres")).neonForTests}));
vi.mock("./duo",async load=>({...await load<typeof import("./duo")>(),duoEnabled:()=>true,readDuoBoard:vi.fn()}));
vi.mock("./duo-readiness",()=>({privateDuoReadiness:async()=>({ready:true})}));
vi.mock("./duo-fit-store",()=>({loadDuoFit:async()=>({role:"Support"})}));
beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","postgresql://fixture.invalid/evening");
  vi.stubEnv("VERCEL_ENV","development");
  vi.stubEnv("PILOT_HOST_EMAILS","host@study.local");
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at)
    SELECT n,CASE WHEN n=4 THEN 'host@study.local' ELSE 'p'||n||'@study.local' END,'Player '||n,
    CASE WHEN n=3 THEN 'teen' ELSE 'adult' END,${TERMS_VERSION},now() FROM generate_series(1,4) n`;
},30000);
afterAll(async()=>{vi.unstubAllEnvs();await postgres.close();});

it("rolls Friday evening forward at the instant interest expires",()=>{
  expect(proposedEvening(new Date("2026-11-28T01:59:59Z"))).toBe("2026-11-28T02:00:00.000Z");
  expect(proposedEvening(new Date("2026-11-28T02:00:00Z"))).toBe("2026-12-05T02:00:00.000Z");
});
it("counts a single adult's chosen role once and expires or withdraws private choices",async()=>{
  const start=proposedEvening();
  expect(await saveEveningChoice(1,"Bottom",start)).toBe(true);
  expect(await saveEveningChoice(1,"Support",start)).toBe(true);
  expect(await saveEveningChoice(2,"Bottom",start)).toBe(true);
  expect(await saveEveningChoice(3,"Support",start)).toBe(false);
  expect(await saveEveningChoice(2,"Bottom","2000-01-01")).toBe(false);
  expect(await saveEveningChoice(4,"Support",start)).toBe(true);
  expect(await eveningTotals(start)).toMatchObject({bot:1,support:1});
  await clearEveningChoice(1);
  expect(await eveningChoice(1,start)).toBeNull();
  await q`UPDATE wp_evening_interest SET session_start=now()-interval '1 minute' WHERE user_id=2`;
  await clearExpiredPilotData();
  expect(await q`SELECT user_id FROM wp_evening_interest`).toEqual([{user_id:4}]);
});
it("counts zero fits and available fits once per day, only after separate current consent",async()=>{
  const start=proposedEvening();
  await q`INSERT INTO wp_duo_pilot_members(user_id,study_version) VALUES(1,1),(2,${DUO_STUDY_VERSION})`;
  expect(await setArrivalConsent(1,true)).toBe(false);
  await recordFitBoardDay(2);
  expect(readDuoBoard).not.toHaveBeenCalled();
  await q`UPDATE wp_duo_pilot_members SET study_version=${DUO_STUDY_VERSION} WHERE user_id=1`;
  for(const id of [1,2]) expect(await setArrivalConsent(id,true)).toBe(true);
  vi.mocked(readDuoBoard).mockResolvedValue({listings:[],requests:[]});
  await recordFitBoardDay(1);
  expect(await arrivalConsent(1,true)).toBe(false);
  vi.mocked(readDuoBoard).mockResolvedValue({listings:[{own:false,held:false,requestState:null} as Awaited<ReturnType<typeof readDuoBoard>>["listings"][number]],requests:[]});
  await recordFitBoardDay(1);
  await recordFitBoardDay(2);
  expect(await eveningTotals(start)).toMatchObject({days:2,available:1});
  await setArrivalConsent(2,false);
  expect(await eveningTotals(start)).toMatchObject({days:1,available:0});
  await leavePilot(1);
  expect(await eveningTotals(start)).toMatchObject({days:0,available:0});
});

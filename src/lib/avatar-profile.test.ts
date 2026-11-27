import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { TERMS_VERSION } from "./account-policy";
import { publicAvatar, parseAvatar, avatarImageUrl, championAvatarArt } from "./avatar";
import { getCurrentUser } from "./auth";
import { q } from "./db";
import { POST } from "../app/api/account/profile/route";

vi.mock("@neondatabase/serverless", async () => ({neon:(await import("../../test/postgres")).neonForTests}));
const token = "5".repeat(64);
vi.mock("next/headers", () => ({cookies:async () => ({get:() => ({value:token})})}));

const champ = {kind:"champion",id:"Ashe"} as const;
const photo = {kind:"upload",id:"00000000-0000-4000-8000-000000000001",hash:"a".repeat(64)} as const;
const other = {...photo,id:"00000000-0000-4000-8000-000000000002"};
const pending = {...photo,id:"00000000-0000-4000-8000-000000000003"};

function save(data: unknown) {
  return POST(new Request("https://test.invalid/api/account/profile", {
    method:"POST",headers:{"Content-Type":"application/json",origin:"https://test.invalid"},body:JSON.stringify(data),
  }));
}
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL","postgresql://fixture.invalid/profile");
  vi.stubEnv("VERCEL_ENV","development");
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at)
    VALUES(1,'self@profile.invalid','Player','adult',${TERMS_VERSION},now()),(2,'peer@profile.invalid','Duo','adult',${TERMS_VERSION},now())`;
  await q`INSERT INTO wp_sessions(user_id,token_hash,expires_at) VALUES(1,${createHash("sha256").update(token).digest("hex")},now()+interval '1 day')`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,profile_icon) VALUES('self','na1','Player','NA1',2300),('other','na1','Duo','NA1',2800)`;
  await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES(1,'self',false),(2,'other',true)`;
  await q`INSERT INTO wp_profile_photos(id,user_id,uploader_id,original_hash,content_hash,needs_human,status,automated_clear,image)
    VALUES(${photo.id},1,1,${photo.hash},${photo.hash},false,'approved',true,decode('00','hex')),
      (${other.id},2,2,${other.hash},${other.hash},false,'approved',true,decode('00','hex')),
      (${pending.id},1,1,${pending.hash},${pending.hash},true,'held',false,decode('00','hex'))`;
},30000);
beforeEach(async () => {
  vi.stubEnv("MODERATION_OPENAI_API_KEY","");
  vi.unstubAllGlobals();
  await q`UPDATE wp_users SET display_name='Player',bio='',avatar_ref=NULL,profile_version=0,safety_status='visible',
    profile_link=NULL WHERE id=1`;
  await q`UPDATE wp_profile_photos SET expires_at=now()+interval '1 hour',active=true`;
});
afterAll(async () => {vi.unstubAllGlobals();vi.unstubAllEnvs();await postgres.close();});

it("keeps public avatar sources allowlisted and old, missing or malformed data readable", () => {
  for (const value of [null,{}, {kind:"upload",id:photo.id,hash:"/file"}, {...champ,url:"https://invalid.com/a"}, {kind:"champion",id:"Unknown"}])
    expect(publicAvatar(value)).toEqual({kind:"initials"});
  expect(parseAvatar({kind:"riot-icon",id:-1})).toBeNull();
  expect(avatarImageUrl(photo)).toBe("/api/profile-photo/"+photo.id+"?v="+photo.hash);
  expect(championAvatarArt("Ashe")?.backgroundImage).toContain("/champions/");
  expect(championAvatarArt("Unknown")).toBeUndefined();
});

it("stores a catalog choice during a text provider outage, preserves it on a legacy save, restores initials explicitly", async () => {
  vi.stubEnv("MODERATION_OPENAI_API_KEY","fixture");
  const fetcher = vi.fn().mockResolvedValue(new Response("unavailable",{status:503}));
  vi.stubGlobal("fetch",fetcher);
  const first = await save({displayName:"Player",bio:"",avatar:champ,profileVersion:0});
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({avatar:champ,profileVersion:1});
  expect(fetcher).not.toHaveBeenCalled();
  expect(await getCurrentUser()).toMatchObject({avatar:champ,profileVersion:1});
  expect((await save({displayName:"Different",bio:"profile",avatar:{kind:"initials"}})).status).toBe(503);
  expect(await getCurrentUser()).toMatchObject({displayName:"Player",avatar:champ});
  vi.stubEnv("MODERATION_OPENAI_API_KEY","");
  expect((await save({displayName:"Changed name",bio:"Likes support"})).status).toBe(200);
  expect(await getCurrentUser()).toMatchObject({displayName:"Changed name",avatar:champ});
  expect((await save({avatar:{kind:"initials"}})).status).toBe(200);
  expect(await q`SELECT avatar_ref FROM wp_users WHERE id=1`).toEqual([{avatar_ref:null}]);
});

it("checks ownership, clearance, expiry and exact immutable bytes transactionally before changing profile or photo", async () => {
  expect((await save({avatar:champ})).status).toBe(200);
  for (const ref of [other,pending,{...photo,hash:"b".repeat(64)}]) {
    expect((await save({avatar:ref,bio:"Attempted edit"})).status).toBe(409);
    expect(await getCurrentUser()).toMatchObject({avatar:champ,bio:"",profileVersion:1});
  }
  expect((await save({avatar:{kind:"champion",id:"Who"}})).status).toBe(400);
  expect((await save({avatar:photo})).status).toBe(200);
  expect(await getCurrentUser()).toMatchObject({avatar:photo});
  await q`UPDATE wp_profile_photos SET expires_at=now()-interval '1 day' WHERE id=${photo.id}`;
  expect((await save({avatar:photo,bio:"Still selected"})).status).toBe(200);
  expect((await save({avatar:champ})).status).toBe(200);
  expect((await save({avatar:photo})).status).toBe(409);
});

it("imports only an icon from the member's linked Riot accounts and prevents concurrent lost edits", async () => {
  expect((await save({avatar:{kind:"riot-icon",id:2800}})).status).toBe(409);
  expect((await save({avatar:{kind:"riot-icon",id:2300},profileVersion:0})).status).toBe(200);
  const actions = await Promise.all([save({avatar:champ,profileVersion:1}),save({bio:"New bio",profileVersion:1})]);
  expect(actions.map(r => r.status).sort()).toEqual([200,409]);
  await q`UPDATE wp_users SET safety_status='held' WHERE id=1`;
  expect((await save({avatar:champ})).status).toBe(403);
});

it("commits an available featured destination with the profile and rejects hidden or non-app destinations without partial writes", async () => {
  await q`INSERT INTO wp_rooms(slug,name) VALUES('avatar-profile-room','Profile room') ON CONFLICT(slug) DO NOTHING`;
  const link = "/rooms/avatar-profile-room";
  expect((await save({profileLink:link,avatar:champ})).status).toBe(200);
  expect(await getCurrentUser()).toMatchObject({profileLink:link,avatar:champ});
  expect((await save({profileLink:"https://not-this-site.invalid/rooms/test",avatar:{kind:"initials"}})).status).toBe(400);
  expect((await save({profileLink:"/post/999999",avatar:{kind:"initials"}})).status).toBe(400);
  expect(await getCurrentUser()).toMatchObject({profileLink:link,avatar:champ});
  expect((await save({profileLink:null})).status).toBe(200);
  expect(await getCurrentUser()).toMatchObject({profileLink:null,avatar:champ});
});

import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { createHash } from "node:crypto";
import { TERMS_VERSION } from "./account-policy";
import { createDuoListing } from "./duo";
import { SESSION_QUEUE, sessionOptions } from "./duo-session";
import { POST as updateProfile } from "../app/api/account/profile/route";
import { managedTextVerdict } from "./managed-text-screen";
import { addComment, createPost } from "./social";
import type { User } from "./auth";

vi.mock("@neondatabase/serverless",async()=>({neon:(await import("../../test/postgres")).neonForTests}));
const author: User = { id:1, email:"private@example.test", displayName:"Player", avatarHue:2, bio:"",createdAt:"2025-01-01",bannedUntil:null,strikeCount:0,termsCurrent:true,ageBand:"adult" };
const http = vi.fn();
const session = "5".repeat(64);
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:session})})}));
beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","postgresql://local.invalid/screening");
  await q`INSERT INTO wp_users(id,email,display_name) VALUES(1,${author.email},'Player')`;
  await q`INSERT INTO wp_posts(id,author_id,kind,body) VALUES(500,1,'text','Match review')`;
},30000);
beforeEach(()=>{vi.stubEnv("MODERATION_OPENAI_API_KEY","inert-fixture"); vi.stubGlobal("fetch",http);});
afterEach(()=>{http.mockReset();vi.unstubAllGlobals();});
afterAll(async()=>{vi.unstubAllEnvs();await postgres.close();});
const result = (flagged:boolean,childSafety=false)=>({flagged,categories:{"sexual/minors":childSafety,harassment:flagged && !childSafety}});
it("keeps the local classifier independent when the provider is off",async()=>{
  vi.stubEnv("MODERATION_OPENAI_API_KEY","");
  expect(await managedTextVerdict(["Discuss the current patch"])).toBe("clear");
  expect(http).not.toHaveBeenCalled();
});
it("screens every rendered field, omitting account metadata, and treats incomplete responses as unavailable",async()=>{
  http.mockResolvedValueOnce(Response.json({results:[result(false),result(false)]}));
  expect(await managedTextVerdict(["poll", "option", ""])).toBe("clear");
  const [url,options] = http.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/moderations");
  expect(JSON.parse(options.body)).toEqual({model:"omni-moderation-latest",input:["poll","option"]});
  http.mockResolvedValueOnce(Response.json({results:[result(false)]}));
  expect(await managedTextVerdict(["poll","option"])).toBe("unavailable");
});
it("queues a post when the configured service is offline, without accusing the author",async()=>{
  http.mockResolvedValueOnce(new Response(null,{status:503}));
  const reply=await createPost(author,{kind:"text",body:"An ordinary performance question"});
  expect(reply).toMatchObject({ok:true,status:"held"});
  expect(await q`SELECT status FROM wp_posts WHERE body='An ordinary performance question'`).toEqual([{status:"held"}]);
});
it("nudges a flagged response and holds it if the author still asks to submit",async()=>{
  http.mockImplementation(()=>Promise.resolve(Response.json({results:[result(true)]})));
  expect(await addComment(author,500,"A synthetic reply")).toMatchObject({ok:false,reconsider:true});
  expect(await addComment(author,500,"A synthetic reply",undefined,false,true)).toMatchObject({ok:true,status:"held"});
});
it("routes a synthetic child-safety signal only to the owner queue and never sanctions on a model verdict",async()=>{
  http.mockResolvedValueOnce(Response.json({results:[result(true,true)]}));
  const message = "Inert safety exercise";
  expect(await createPost(author,{kind:"text",body:message,submitForReview:true})).toMatchObject({ok:false});
  expect(await q`SELECT id FROM wp_posts WHERE body=${message}`).toHaveLength(0);
  expect(await q`SELECT rule FROM wp_safety_urgent WHERE target_kind='user' AND target_id=1`).toEqual([{rule:"child_safety"}]);
  expect(await q`SELECT id FROM wp_users WHERE id=1 AND banned_until IS NULL`).toHaveLength(1);
  expect(await q`SELECT id FROM wp_mod_log WHERE detail LIKE '%Inert safety exercise%'`).toHaveLength(0);
});

it("preserves an existing profile on provider failure and holds an eligible duo note for review",async()=>{
  await q`UPDATE wp_users SET age_band='adult',terms_version=${TERMS_VERSION},terms_accepted_at=now(),created_at=now()-interval '7 days' WHERE id=1`;
  await q`INSERT INTO wp_sessions(user_id,token_hash,expires_at) VALUES(1,${createHash("sha256").update(session).digest("hex")},now()+interval '1 day')`;
  http.mockResolvedValueOnce(new Response(null,{status:503}));
  const profile=await updateProfile(new Request("https://app.test/api/account/profile",{method:"POST",
    headers:{origin:"https://app.test","content-type":"application/json"},body:JSON.stringify({displayName:"Proposed Name",bio:"An ordinary bio"})}));
  expect(profile.status).toBe(503);
  expect(await q`SELECT display_name FROM wp_users WHERE id=1`).toEqual([{display_name:"Player"}]);
  vi.stubEnv("DUO_MATCHING_ENABLED","true");
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,rank_div,snapshot) VALUES(
    'fixture-player','na1','Fixture','NA1','GOLD','II','{"matches":[{}],"champPool":[]}'::jsonb)`;
  await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES(1,'fixture-player',true)`;
  http.mockResolvedValueOnce(Response.json({results:[result(true)]}));
  const start = sessionOptions(Date.now())[1];
  expect(await createDuoListing(author,{queue:SESSION_QUEUE,start,roles:["Support"],vibe:"chill",voice:false,note:"Practice with me"})).toMatchObject({ok:true,held:true});
  expect(await q`SELECT status FROM wp_lfg WHERE user_id=1`).toEqual([{status:"held"}]);
});

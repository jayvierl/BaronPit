import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { createPost, addComment, getPost, listComments } from "./social";
import { recentSubmissions, withdrawSubmission } from "./submissions";
import { fileReport, resolveCase } from "./safety-cases";
import type { User } from "./auth";

vi.mock("@neondatabase/serverless", async () => ({neon:(await import("../../test/postgres")).neonForTests}));
function actor(id:number,probation=false): User {
  return {id,email:`player${id}@fixtures.invalid`,displayName:"Test",avatarHue:1,bio:"",
    createdAt:probation?new Date().toISOString():"2020-01-01",bannedUntil:null,strikeCount:0,ageBand:"adult",termsCurrent:true};
}
beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","postgres://test");
  vi.stubEnv("VERCEL_ENV","development");
  vi.stubEnv("MODERATION_OPENAI_API_KEY","");
  vi.stubEnv("ADMIN_EMAILS","player4@fixtures.invalid");
  await q`SELECT 1`;
  await postgres.exec(`INSERT INTO wp_users(id,email,display_name)
    SELECT id,'player'||id||'@fixtures.invalid','Test '||id FROM generate_series(1,4) AS id`);
},30000);
afterAll(async()=>{await postgres.close();vi.unstubAllEnvs();});

it("commits exactly one concurrent held post and audit entry, scoped per author",async()=>{
  // Borderline wording from a probation account, submitted for review: the
  // one path that still lands a post in the held state at publish time.
  const draft = {kind:"text" as const,body:"fuck shit, which ward would you keep for dragon?",submitForReview:true,submissionId:randomUUID()};
  const [a,b] = await Promise.all([createPost(actor(1,true),draft),createPost(actor(1,true),draft)]);
  expect(a).toEqual(b); expect(a.ok && a.status).toBe("held");
  if (!a.ok) throw Error(a.error);
  expect(await q`SELECT count(*)::int AS count FROM wp_mod_log WHERE target_kind='post' AND target_id=${a.postId}`).toEqual([{count:1}]);
  expect((await createPost(actor(1),{...draft,body:"A different payload"})).ok).toBe(false);
  expect((await createPost(actor(2),draft))).not.toEqual(a);
  expect(await resolveCase(actor(4),"post",a.postId,"dismiss","other")).toBe(true);
  expect(await createPost(actor(1),draft)).toMatchObject({postId:a.postId,status:"visible"});
  expect((await recentSubmissions(1)).entries[0]).toMatchObject({status:"visible",canOpen:true});
});

it("deduplicates replies, hides a withdrawn branch, and retains a private current receipt",async()=>{
  const parent = await createPost(actor(1),{kind:"text",body:"How do you ward here?"});
  if (!parent.ok) throw Error(parent.error);
  const key=randomUUID();
  const write=()=>addComment(actor(3),parent.postId,"Wait for the wave.",undefined,false,false,key);
  const [a,b]=await Promise.all([write(),write()]);
  expect(a).toEqual(b);if (!a.ok) throw Error(a.error);
  const child=await addComment(actor(2),parent.postId,"I tried that.",a.postId);
  expect(child.ok).toBe(true);
  expect(await withdrawSubmission(1,"comment",a.postId)).toBe(false);
  expect(await withdrawSubmission(3,"comment",a.postId)).toBe(true);
  expect(await withdrawSubmission(3,"comment",a.postId)).toBe(true);
  expect(await write()).toMatchObject({postId:a.postId,status:"withdrawn"});
  expect(await listComments(parent.postId,null)).toEqual([]);
  expect((await recentSubmissions(2)).entries.find(r=>r.kind==="comment")).toMatchObject({canOpen:false,excerpt:""});
  expect((await recentSubmissions(3)).entries[0]).toMatchObject({status:"withdrawn",canOpen:false});
  expect(await q`SELECT body FROM wp_comments WHERE id=${a.postId}`).toEqual([{body:""}]);
});

it("keeps reported evidence for adjudication and never republishes a withdrawal",async()=>{
  const created=await createPost(actor(2),{kind:"text",body:"A fixture under review"});
  if (!created.ok) throw Error(created.error);
  expect((await fileReport(actor(3),"post",created.postId,"other","Check this fixture")).status).toBe(200);
  expect(await withdrawSubmission(2,"post",created.postId)).toBe(true);
  expect(await q`SELECT body FROM wp_posts WHERE id=${created.postId}`).toEqual([{body:"A fixture under review"}]);
  expect(await resolveCase(actor(4),"post",created.postId,"dismiss","other")).toBe(true);
  expect(await getPost(created.postId,null)).toBeNull();
  await q`UPDATE wp_posts SET status='visible' WHERE id=${created.postId}`;
  expect(await getPost(created.postId,actor(2))).toBeNull();
});

it("pages private receipts even for equal timestamps and excludes another author's receipts",async()=>{
  await postgres.exec(`INSERT INTO wp_posts(author_id,body,created_at) SELECT 4,'Paging '||n,'2021-01-01' FROM generate_series(1,22) n`);
  const first=await recentSubmissions(4);
  expect(first.entries).toHaveLength(20);expect(first.next).toBeTruthy();
  const next=await recentSubmissions(4,first.next!);
  expect(next.entries).toHaveLength(2);
  expect(new Set([...first.entries,...next.entries].map(r=>r.id)).size).toBe(22);
  expect(first.entries.every(r=>r.excerpt.startsWith("Paging"))).toBe(true);
});

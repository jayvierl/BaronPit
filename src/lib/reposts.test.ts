import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { readPosts } from "./post-reader";
import { setRepost } from "./reposts";
import { POST } from "../app/api/social/repost/route";

const gates = vi.hoisted(() => ({requireUser: vi.fn(), rateLimit: vi.fn()}));
vi.mock("@neondatabase/serverless", async () => ({neon: (await import("../../test/postgres")).neonForTests}));
vi.mock("./auth", async original => ({...await original<typeof import("./auth")>(), rateLimit: gates.rateLimit}));
vi.mock("./auth-http", async original => ({...await original<typeof import("./auth-http")>(), requireUser: gates.requireUser}));

beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/community");
  await q`SELECT 1`;
  await postgres.exec(`
    INSERT INTO wp_users(id,email,display_name) VALUES
      (1,'v@fixture.invalid','Reader'),(2,'o@fixture.invalid','Writer'),(3,'s@fixture.invalid','Duo'),
      (4,'s2@fixture.invalid','Jungle');
    INSERT INTO wp_rooms(id,slug,name,kind) VALUES (1,'general','General','general');
    INSERT INTO wp_posts(id,author_id,room_id,kind,body,status) VALUES
      (10,2,1,'text','How did bot lane get prio?','visible'),
      (11,2,1,'text','New strategy','held'),(12,2,1,'clip','My play','visible');
    INSERT INTO wp_follows(follower_id, followee_id) VALUES (1,3),(1,4);
  `);
}, 30000);
afterAll(async () => {await postgres.close(); vi.unstubAllEnvs();});
const following = () => readPosts(1, {following:true}, 20);

it("distributes one attributed original to followers, preserves first-share order through retries and undo, and checks visibility on every read", async () => {
  expect(await following()).toEqual([]);
  expect(await setRepost(2,10,true)).toBe(false);
  expect(await setRepost(3,11,true)).toBe(false);
  expect(await setRepost(3,12,true)).toBe(false);
  expect(await setRepost(3,10,true)).toBe(true);
  const [first] = await following();
  expect(first).toMatchObject({id:10,authorId:2,authorName:"Writer",repostedBy:{id:3,name:"Duo"}});
  expect(await setRepost(3,10,true)).toBe(true);
  expect(await following()).toEqual([first]);
  expect((await readPosts(3,{postId:10},1))[0].myRepost).toBe(true);
  expect((await readPosts(null,{},20))[0].repostedBy).toBeUndefined();
  expect(await setRepost(3,10,false)).toBe(true);
  expect(await following()).toEqual([]);
  expect(await setRepost(3,10,true)).toBe(true);
  expect(await following()).toEqual([first]);
  await setRepost(4,10,true);
  expect(await following()).toHaveLength(1);
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES (1,4)`;
  expect(await following()).toEqual([first]);
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (2,3)`;
  expect(await following()).toEqual([]);
  expect(await setRepost(3,10,true)).toBe(false);
  await q`DELETE FROM wp_blocks WHERE blocker_id=2`;
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES (3,2)`;
  expect(await following()).toEqual([]);
  expect(await setRepost(3,10,true)).toBe(false);
  await q`DELETE FROM wp_mutes WHERE muter_id=3`;
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (2,1)`;
  expect(await following()).toEqual([]);
  await q`DELETE FROM wp_blocks`;
  await q`UPDATE wp_rooms SET safety_status='held' WHERE id=1`;
  expect(await following()).toEqual([]);
  await q`UPDATE wp_rooms SET safety_status='visible' WHERE id=1`;
  await q`UPDATE wp_users SET banned_until=now()+interval '1 day' WHERE id=3`;
  expect(await following()).toEqual([]);
  await q`UPDATE wp_users SET banned_until=NULL WHERE id=3`;
  expect(await following()).toEqual([first]);
  await q`UPDATE wp_posts SET status='removed' WHERE id=10`;
  expect(await following()).toEqual([]);
  expect(await setRepost(3,10,false)).toBe(true);
  expect((await q`SELECT count(*)::int n FROM wp_posts`)[0].n).toBe(3);
});

it("requires participation for new shares, limits first-day accounts and rate, and permits withdrawal during a safety pause", async () => {
  const request = (active: boolean) => new Request("https://fixture.invalid/api/social/repost", {
    method: "POST", body: JSON.stringify({postId:10,active}),
  });
  gates.requireUser.mockResolvedValueOnce({ok:false,response:new Response(null,{status:401})});
  expect((await POST(request(true))).status).toBe(401);
  expect(gates.requireUser).toHaveBeenLastCalledWith(expect.any(Request), "participate");
  gates.requireUser.mockResolvedValueOnce({ok:true,user:{id:3,createdAt:new Date().toISOString()}});
  expect((await POST(request(true))).status).toBe(403);
  gates.requireUser.mockResolvedValue({ok:true,user:{id:3,createdAt:"2020-01-01"}});
  gates.rateLimit.mockResolvedValueOnce(false);
  expect((await POST(request(true))).status).toBe(429);
  expect((await POST(request(false))).status).toBe(200);
  expect(gates.requireUser).toHaveBeenLastCalledWith(expect.any(Request), "protect");
});

it("accepts a published build, refuses to repost the patch publisher and leaves unrelated timelines alone", async () => {
  await q`INSERT INTO wp_posts(id,author_id,kind,body,data) VALUES
    (13,2,'build','Why I build it','{"items":[1234],"champion":"Ashe"}')`;
  await q`INSERT INTO wp_users(id,email,display_name) VALUES (7,'team@wardparty.local','Patch desk')`;
  await q`INSERT INTO wp_posts(id,author_id,kind,body) VALUES (14,7,'text','Patch discussion')`;
  expect(await setRepost(3,13,true)).toBe(true);
  expect(await setRepost(3,14,true)).toBe(false);
  expect((await readPosts(7,{following:true},20)).map(post => post.id)).toEqual([14]);
});

it("removes a quote repost from Following if the underlying original and the sharer become blocked", async () => {
  await q`INSERT INTO wp_users(id,email,display_name) VALUES (5,'quote@fixture.invalid','Quote writer')`;
  await q`INSERT INTO wp_posts(id,author_id,body) VALUES (20,2,'Original wave timing'),(21,5,'Commentary on the wave')`;
  await q`INSERT INTO wp_quote_posts(post_id,original_post_id,original_author_id) VALUES (21,20,2)`;
  expect(await setRepost(3,21,true)).toBe(true);
  expect((await following()).find(post => post.id === 21)?.repostedBy).toMatchObject({ id: 3 });

  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (2,3)`;
  expect(await setRepost(3,21,true)).toBe(false);
  expect((await following()).find(post => post.id === 21)).toBeUndefined();
  await q`INSERT INTO wp_follows(follower_id,followee_id) VALUES(1,5)`;
  const independentlyFollowed = (await following()).find(post => post.id === 21);
  expect(independentlyFollowed).toMatchObject({ body: "Commentary on the wave", quote: { original: { postId: 20 } } });
  expect(independentlyFollowed?.repostedBy).toBeUndefined();

  await q`DELETE FROM wp_blocks WHERE blocker_id=2 AND blocked_id=3`;
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (3,2)`;
  expect((await following()).find(post => post.id === 21)?.repostedBy).toBeUndefined();
  await q`DELETE FROM wp_blocks WHERE blocker_id=3 AND blocked_id=2`;
  expect((await following()).find(post => post.id === 21)?.repostedBy).toMatchObject({ id: 3 });
});

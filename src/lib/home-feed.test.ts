import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { feedCursor, homeFeedHref, readFeedCursor } from "./feed-pagination";
import { readHomeFeedPage } from "./post-reader";
import { joinedRoomIds, setRoomMembership } from "./rooms";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));

const asOf = Date.parse("2026-11-27T12:00:00Z");
const openPage = (tab: "following" | "everyone", next: string | null = null, length = 3) =>
  readHomeFeedPage(1, tab, readFeedCursor(next, tab, asOf + 60_000), asOf, length);

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/home-feed");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`SELECT 1`;
  await postgres.exec(`
    INSERT INTO wp_users(id,email,display_name) SELECT i,'feed'||i||'@fixtures.invalid','Player '||i FROM generate_series(1,7) i;
    INSERT INTO wp_rooms(id,slug,name,kind) VALUES(10,'fixture-laning','Fixture Laning','general'), (11,'fixture-hidden','Fixture Hidden','general');
    UPDATE wp_rooms SET safety_status='held' WHERE id=11;
    INSERT INTO wp_follows(follower_id,followee_id) VALUES(1,2),(1,5),(1,6),(1,7);
    INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (5,1);
    INSERT INTO wp_mutes(muter_id,muted_id) VALUES (1,6);
    INSERT INTO wp_posts(id,author_id,room_id,status,kind,body,created_at) VALUES
      (101,2,NULL,'visible','text','Older followed','2026-11-27T07:00:00Z'),
      (102,3,10,'visible','text','Chosen room','2026-11-27T08:00:00.123456Z'),
      (103,2,NULL,'visible','text','Followed tie','2026-11-27T08:00:00.123456Z'),
      (104,5,10,'visible','text','Blocked author','2026-11-27T11:00:00Z'),
      (105,6,10,'visible','text','Muted author','2026-11-27T11:01:00Z'),
      (106,4,NULL,'visible','text','Public only','2026-11-27T11:05:00Z'),
      (107,1,NULL,'visible','text','Own','2026-11-27T09:00:00Z'),
      (108,2,11,'visible','text','Held room','2026-11-27T11:09:00Z'),
      (109,4,NULL,'visible','text','Reposted by followed player','2026-11-24T08:00:00Z');
    INSERT INTO wp_reposts(user_id,post_id,first_shared_at) VALUES(7,109,'2026-11-27T10:00:00Z'),(7,105,'2026-11-27T11:10:00Z');`);
  expect(await setRoomMembership(1,10,true)).toBe(true);
},30_000);
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

it("shows an unlinked viewer joined-room posts and pages chronological Following by timestamp and ID", async () => {
  expect(await q`SELECT 1 FROM wp_links WHERE user_id=1`).toEqual([]);
  expect(await joinedRoomIds(1)).toEqual([10]);
  const first = await openPage("following");
  expect(first.posts.map(p => p.id)).toEqual([109,107,103]);
  expect(first.posts[0].repostedBy?.id).toBe(7);
  expect(first.posts[0]).not.toHaveProperty("cursorAt");
  expect(readFeedCursor(first.next,"following",asOf)).toEqual({asOf:new Date(asOf).toISOString(),before:"2026-11-27T08:00:00.123456Z",id:103});
  expect(readFeedCursor(first.next,"everyone",asOf)).toBeNull();
  await q`INSERT INTO wp_reposts(user_id,post_id,first_shared_at) VALUES(7,101,'2026-11-27T12:00:30Z')`;
  const second = await openPage("following",first.next);
  expect(second.posts.map(p => p.id)).toEqual([102,101]);
  expect(second.next).toBeNull();
});

it("uses the first page cutoff for For you and keeps fresh reply activity out of Following order", async () => {
  const first = await openPage("everyone",null,2);
  expect(first.posts.map(p => p.id)).toEqual([106,107]);
  await q`INSERT INTO wp_comments(id,post_id,author_id,body,status,created_at) VALUES(21,101,7,'New reply','visible','2026-11-27T12:00:15Z')`;
  expect((await openPage("everyone",first.next,2)).posts.map(p => p.id)).toEqual([103,102]);
  expect((await readHomeFeedPage(1,"everyone",null,asOf+60_000,2)).posts.map(p => p.id)).toEqual([101,106]);
  expect((await openPage("following")).posts.map(p => p.id)).toEqual([109,107,103]);
});

it("rejects malformed and future cursors and keeps tab context in the native link", () => {
  expect(readFeedCursor("bad","following",asOf)).toBeNull();
  const future = feedCursor("following",new Date(asOf+1000).toISOString(),new Date(asOf).toISOString(),101);
  expect(readFeedCursor(future,"following",asOf)).toBeNull();
  const invalidDate = feedCursor("following","2026-11-31T00:00:00.000Z",new Date(asOf).toISOString(),101);
  expect(readFeedCursor(invalidDate,"following",asOf+10*86_400_000)).toBeNull();
  const yearZero = "0000-01-01T00:00:00.000Z";
  expect(readFeedCursor(feedCursor("following",yearZero,yearZero,101),"following",asOf)).toBeNull();
  expect(readFeedCursor(feedCursor("following",new Date(asOf).toISOString(),yearZero,101),"following",asOf)).toBeNull();
  expect(homeFeedHref("following",future)).toBe(`/?tab=following&before=${future}`);
});

it("keeps the latest eligible peer reply while traversing older ancestors in the same post", async () => {
  await postgres.exec(`
    INSERT INTO wp_users(id,email,display_name) VALUES (8,'team@wardparty.local','Patch publisher');
    INSERT INTO wp_posts(id,author_id,kind,status,body,created_at) VALUES
      (110,2,'text','visible','Post with historical ancestors','2026-11-17T12:00:00Z'),
      (111,2,'text','visible','Different discussion','2026-11-17T12:00:00Z'),
      (112,2,'text','held','Held discussion','2026-11-17T12:00:00Z');
    INSERT INTO wp_comments(id,post_id,author_id,parent_id,status,withdrawn_at,body,created_at) VALUES
      (30,110,2,NULL,'visible',NULL,'Older root','2026-11-18T00:00:00Z'),
      (31,110,2,30,'visible',NULL,'Older parent','2026-11-18T01:00:00Z'),
      (32,110,7,31,'visible',NULL,'Visible recent peer A','2026-11-28T10:00:00Z'),
      (33,110,7,31,'visible',NULL,'Visible recent peer B','2026-11-28T10:00:00Z'),
      (34,110,7,NULL,'held',NULL,'Held root','2026-11-18T00:00:00Z'),
      (35,110,7,34,'visible',NULL,'Child of held root','2026-11-28T10:30:00Z'),
      (36,110,7,NULL,'visible','2026-11-26T10:00:00Z','Withdrawn root','2026-11-18T00:00:00Z'),
      (37,110,7,36,'visible',NULL,'Child of withdrawn root','2026-11-28T10:35:00Z'),
      (38,110,6,NULL,'visible',NULL,'Muted root','2026-11-18T00:00:00Z'),
      (39,110,7,38,'visible',NULL,'Child of muted root','2026-11-28T10:40:00Z'),
      (40,111,7,30,'visible',NULL,'Wrong post for parent','2026-11-28T10:45:00Z'),
      (41,112,7,NULL,'visible',NULL,'Reply in a held post','2026-11-28T10:50:00Z'),
      (42,110,2,31,'visible',NULL,'Post author reply','2026-11-28T11:00:00Z'),
      (43,110,8,31,'visible',NULL,'Publisher reply','2026-11-28T11:15:00Z'),
      (44,110,7,31,'visible',NULL,'Outside anchored cutoff','2026-11-28T12:01:00Z');`);
  const cutoff = Date.parse("2026-11-28T12:00:00Z");
  const {posts} = await readHomeFeedPage(1,"everyone",null,cutoff,1);
  expect(posts[0]).toMatchObject({id:110,lastReplyId:33});
  expect((await readHomeFeedPage(1,"everyone",null,cutoff+120_000,1)).posts[0]).toMatchObject({id:110,lastReplyId:44});
});

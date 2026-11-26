import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { profileReplies } from "./profile-replies";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/profile-replies");
  await q`SELECT 1`;
}, 30000);
beforeEach(async () => {
  await postgres.exec(`
    TRUNCATE wp_users, wp_rooms RESTART IDENTITY CASCADE;
    INSERT INTO wp_users(id,email,display_name) VALUES
      (1,'viewer@example.invalid','Viewer'),(2,'author@example.invalid','Reply author'),
      (3,'poster@example.invalid','Thread author'),(4,'parent@example.invalid','Parent author');
    INSERT INTO wp_rooms(id,slug,name) VALUES (1,'general','General');
    INSERT INTO wp_posts(id,author_id,room_id,body,status) VALUES (10,3,1,'Public thread','visible');
    INSERT INTO wp_comments(id,post_id,author_id,body) VALUES
      (11,10,2,'Top level'),(12,10,4,'First ancestor');
    INSERT INTO wp_comments(id,post_id,author_id,parent_id,body) VALUES
      (13,10,4,12,'Second ancestor'),(14,10,2,13,'Nested');
  `);
});
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

it("shows only the selected author and the person each reply actually addresses", async () => {
  const page = await profileReplies(2, null, null);
  expect(page.next).toBeNull();
  expect(page.replies).toMatchObject([
    {id:14, postId:10, room:"General", body:"Nested", recipient:"Parent author"},
    {id:11, postId:10, room:"General", body:"Top level", recipient:"Thread author"},
  ]);
});

it("drops hidden parents, direct reports, inaccessible rooms and blocked threads", async () => {
  await postgres.exec("INSERT INTO wp_mutes(muter_id,muted_id) VALUES (1,4)");
  expect((await profileReplies(2,1,null)).replies.map(r => r.id)).toEqual([11]);
  expect((await profileReplies(2,null,null)).replies).toHaveLength(2);
  await postgres.exec("UPDATE wp_comments SET status='held' WHERE id=12");
  expect((await profileReplies(2,null,null)).replies.map(r => r.id)).toEqual([11]);
  await postgres.exec("INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (3,1)");
  expect((await profileReplies(2,1,null)).replies).toEqual([]);
  await postgres.exec("UPDATE wp_rooms SET safety_status='held' WHERE id=1");
  expect((await profileReplies(2,null,null)).replies).toEqual([]);
  await postgres.exec("UPDATE wp_rooms SET safety_status='visible'; UPDATE wp_users SET banned_until=now()+interval '1 day' WHERE id=2");
  expect((await profileReplies(2,null,null)).replies).toEqual([]);
});

it("pages after visibility filtering and never repeats the last reply of a page", async () => {
  await postgres.exec(`INSERT INTO wp_comments(id,post_id,author_id,body,status)
    SELECT n,10,2,'number ' || n,CASE WHEN n>=40 THEN 'held' ELSE 'visible' END FROM generate_series(20,50) n`);
  const newest = await profileReplies(2,2,null);
  expect(newest.replies).toHaveLength(20);
  expect(newest.replies[0].id).toBe(39);
  expect(newest.next).toBe(20);
  const older = await profileReplies(2,2,String(newest.next));
  expect(older.replies.map(r => r.id)).toEqual([14,11]);
  expect(older.next).toBeNull();
});

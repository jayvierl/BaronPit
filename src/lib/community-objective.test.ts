import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres, testQueries } from "../../test/postgres";
import { q } from "./db";
import { objectiveDay, readCommunityObjective } from "./community-objective";
import { PATCH_PUBLISHER } from "./patch-notes";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));

const at = (day: number) => new Date(Date.UTC(2026, 10, day));
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/objective");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`SELECT 1`;
  await postgres.exec(`
    SET TIME ZONE 'America/Los_Angeles';
    INSERT INTO wp_users(id,email,display_name)
      SELECT n,n||'@example.invalid','Player '||n FROM generate_series(1,12) AS n;
    UPDATE wp_users SET safety_status='held' WHERE id=7;
    UPDATE wp_users SET banned_until=now()+interval '2 days' WHERE id=8;
    INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (1,4),(6,1);
    INSERT INTO wp_mutes(muter_id,muted_id) VALUES (1,5);
    INSERT INTO wp_rooms(id,name,slug,safety_status) VALUES (1,'Room','room','held');
    INSERT INTO wp_posts(id,author_id,kind,room_id,card_validated,status,created_at) VALUES
      (1,2,'card',null,true,'visible','2026-11-23T00:00:00Z'),
      (2,2,'card',null,true,'visible','2026-11-23T23:59:59Z'),
      (3,3,'card',null,true,'visible','2026-11-24T00:00:00Z'),
      (4,3,'card',null,false,'visible','2026-11-23T12:00:00Z'),
      (5,4,'card',null,true,'visible','2026-11-23T12:00:00Z'),
      (6,5,'card',null,true,'visible','2026-11-23T12:00:00Z'),
      (7,6,'card',null,true,'visible','2026-11-23T12:00:00Z'),
      (8,7,'card',null,true,'visible','2026-11-23T12:00:00Z'),
      (9,8,'card',null,true,'visible','2026-11-23T12:00:00Z'),
      (10,9,'card',1,true,'visible','2026-11-23T12:00:00Z'),
      (11,10,'card',null,true,'visible','2026-11-23T12:00:00Z'),
      (12,11,'card',null,true,'held','2026-11-23T12:00:00Z'),
      (13,2,'build',null,false,'visible','2026-11-24T00:00:00Z'),
      (14,3,'text',null,false,'visible','2026-11-26T05:00:00Z'),
      (15,2,'text',null,false,'visible','2026-11-26T06:00:00Z');
    INSERT INTO wp_decisions(post_id,champion,role,topic) VALUES
      (14,'Ashe','Bottom','Build choice');
    INSERT INTO wp_comments(id,post_id,author_id,parent_id,body,status,one_fix,created_at) VALUES
      (1,1,3,null,'Advice','visible',true,'2026-11-25T00:00:00Z'),
      (2,2,3,null,'More','visible',true,'2026-11-25T00:10:00Z'),
      (3,2,2,null,'Self review','visible',true,'2026-11-25T12:00:00Z'),
      (4,2,9,2,'Nested','visible',true,'2026-11-25T12:00:00Z'),
      (5,2,9,null,'Held','held',true,'2026-11-25T12:00:00Z'),
      (6,4,9,null,'Legacy card','visible',true,'2026-11-25T12:00:00Z'),
      (7,2,5,null,'Muted','visible',true,'2026-11-25T12:00:00Z');
    INSERT INTO wp_reactions(user_id,target_kind,target_id,emoji,created_at) VALUES
      (3,'post',1,'GG','2026-11-27T00:00:00Z'),(3,'post',1,'👏','2026-11-27T12:00:00Z'),
      (2,'post',1,'GG','2026-11-27T12:00:00Z'),(4,'post',1,'GG','2026-11-27T12:00:00Z'),
      (11,'comment',1,'GG','2026-11-27T12:00:00Z'),(11,'post',1,'dislike','2026-11-27T12:00:00Z'),
      (11,'post',12,'GG','2026-11-27T12:00:00Z');
  `);
  await q`UPDATE wp_users SET email=${PATCH_PUBLISHER} WHERE id=10`;
}, 30_000);
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

it("rotates at UTC midnight independently of server and database time zones", () => {
  expect(objectiveDay(new Date("2026-11-22T18:59:59.999-05:00")).end).toBe(at(23).toISOString());
  expect(objectiveDay(new Date("2026-11-22T19:00:00-05:00"))).toMatchObject({
    goal: { kind: "cards" }, start: at(23).toISOString(), end: at(24).toISOString(),
  });
});

it("counts distinct visible people sharing validated cards, with half-open dates and immediate moderation", async () => {
  expect(await readCommunityObjective(1, at(23))).toMatchObject({ kind: "cards", count: 1 });
  expect(await readCommunityObjective(null, at(23))).toMatchObject({ count: 3, target: 3 });
  await q`UPDATE wp_posts SET status='removed' WHERE id IN (1,2)`;
  try {
    expect(await readCommunityObjective(1, at(23))).toMatchObject({ count: 0 });
  } finally {
    await q`UPDATE wp_posts SET status='visible' WHERE id IN (1,2)`;
  }
});

it("queries only the selected action on build day and never reads private duo listings", async () => {
  const start = testQueries.length;
  expect(await readCommunityObjective(1, at(24))).toMatchObject({ kind: "builds", count: 1, href: "/#compose" });
  const statements = testQueries.slice(start);
  expect(statements).toHaveLength(1);
  expect(statements[0]).not.toMatch(/wp_comments|wp_reactions|wp_decisions|wp_lfg|created_at::date/);
});

it("counts only public top-level fixes on someone else's validated card and links to a visible peer card", async () => {
  expect(await readCommunityObjective(1, at(25))).toMatchObject({ kind: "fixes", count: 1, href: "/post/3" });
  expect(await readCommunityObjective(3, at(25))).not.toMatchObject({ href: "/post/3" });
});

it("uses a real question or discussion destination even when a peer game card is unavailable", async () => {
  expect(await readCommunityObjective(1, at(26))).toMatchObject({ kind: "questions", count: 1, href: "/questions/new" });
  await q`UPDATE wp_posts SET card_validated=false WHERE id IN (1,2,3)`;
  try {
    expect(await readCommunityObjective(1, at(25))).toMatchObject({ kind: "questions", count: 0, href: "/questions/new" });
  } finally {
    await q`UPDATE wp_posts SET card_validated=true WHERE id IN (1,2,3)`;
  }
});

it("counts one positive public post reaction per peer, ignoring self-reactions and hidden targets", async () => {
  expect(await readCommunityObjective(1, at(27))).toMatchObject({ kind: "reactions", count: 1, href: "/post/15" });
});

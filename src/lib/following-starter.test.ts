import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { followingStarter, activeStarterRoom } from "./following-starter";
import { PATCH_PUBLISHER } from "./patch-notes";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL","postgresql://fixture.invalid/following");
  vi.stubEnv("VERCEL_ENV","development");
  await q`INSERT INTO wp_users(id,email,display_name) VALUES
    (1,'viewer@example.test','Me'),(2,'partner@example.test','Scout'),(3,'another@example.test','Peer'),
    (4,'muted@example.test','Muted'),(5,${PATCH_PUBLISHER},'Publisher')`;
  await q`INSERT INTO wp_rooms(id,slug,name) VALUES (1,'ones','Support room'),(2,'twos','Other room')`;
  await q`INSERT INTO wp_posts(id,author_id,room_id,body) VALUES
    (10,2,1,'Support question'),(11,3,2,'Bot question'),(12,4,2,'Muted question'),(13,5,2,'System message')`;
  await q`INSERT INTO wp_decisions(post_id,champion,role,topic) VALUES
    (10,'Bard','Support','Macro'),(11,'Ashe','Bot','Macro'),(12,'Ashe','Bot','Macro')`;
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES (1,4)`;
},30_000);
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

it("selects one visible unanswered question, ranking the viewer's role and skipping existing follows", async () => {
  await q`INSERT INTO wp_decision_preferences(user_id,role) VALUES(1,'Support')`;
  expect(await followingStarter(1)).toMatchObject({id:10,authorId:2});
  await q`UPDATE wp_posts SET replies_closed=true WHERE id=10`;
  expect(await followingStarter(1)).toMatchObject({id:11});
  await q`UPDATE wp_posts SET replies_closed=false WHERE id=10`;
  await q`INSERT INTO wp_comments(post_id,author_id,body,withdrawn_at) VALUES (10,3,'Withdrawn advice',now())`;
  expect(await followingStarter(1)).toMatchObject({id:10});
  await q`INSERT INTO wp_comments(post_id,author_id,body) VALUES (10,3,'A public reply')`;
  expect(await followingStarter(1)).toMatchObject({id:11});
  await q`INSERT INTO wp_follows(follower_id,followee_id) VALUES(1,3)`;
  expect(await followingStarter(1)).toBeNull();
});

it("offers an active room, respecting joined rooms and moderation", async () => {
  expect(await activeStarterRoom(1)).toMatchObject({id:2});
  await q`INSERT INTO wp_room_members(room_id,user_id) VALUES (2,1)`;
  expect(await activeStarterRoom(1)).toMatchObject({id:1});
  await q`UPDATE wp_rooms SET safety_status='held' WHERE id=1`;
  expect(await activeStarterRoom(1)).toBeNull();
});

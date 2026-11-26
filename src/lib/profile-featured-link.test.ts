import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { parseProfileLink, readProfileLink } from "./profile-featured-link";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/featured");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`INSERT INTO wp_users(id,email,display_name) VALUES(1,'a@unit.test','A'),(2,'b@unit.test','B')`;
  await q`INSERT INTO wp_rooms(id,slug,name,description) VALUES(3,'test-room','Test room','Test')`;
  await q`INSERT INTO wp_posts(id,author_id,kind,body,room_id) VALUES(17,2,'build','A build',3)`;
},30000);
afterAll(async () => {vi.unstubAllEnvs(); await postgres.close();});
it("stores only supported internal destinations and strips tracking and fragments", () => {
  const parse = (input: unknown) => parseProfileLink(input, "https://baronpit.com");
  expect(parse(" https://baronpit.com/post/17?from=here#reply-40 ")).toBe("/post/17");
  expect(parse("/rooms/test-room/")).toBe("/rooms/test-room");
  expect(parse("")).toBeNull();
  for (const target of ["//example.test/post/1","https://baronpit.com.example.test/post/1","https://user@baronpit.com/post/1","javascript:alert(1)","/me","/post/2147483648",{}]) expect(parse(target)).toBeUndefined();
});
it("rechecks a featured destination for the viewer on every read", async () => {
  expect(await readProfileLink("/post/17", 1)).toMatchObject({href:"/post/17",label:"Featured build"});
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(2,1)`;
  expect(await readProfileLink("/post/17",1)).toBeNull();
  expect(await readProfileLink("/post/17",null)).toBeTruthy();
  await q`UPDATE wp_posts SET status='held' WHERE id=17`;
  expect(await readProfileLink("/post/17",null)).toBeNull();
  expect(await readProfileLink("/rooms/test-room",null)).toMatchObject({label:"Test room"});
  await q`UPDATE wp_rooms SET safety_status='held' WHERE id=3`;
  expect(await readProfileLink("/rooms/test-room",null)).toBeNull();
});

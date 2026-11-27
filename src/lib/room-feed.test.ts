import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import type { User } from "./auth";
import { readRoomFeed, roomFeedFromParam, roomFeedHref } from "./room-feed";
import { buildFeed } from "./social";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
vi.mock("./build-catalog", () => ({ buildCatalog: async () => null }));

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/room-feed");
  await q`SELECT 1`;
  await postgres.exec(`
    INSERT INTO wp_users(id,email,display_name,avatar_hue) VALUES
      (1,'viewer@fixture.invalid','Viewer',5),(2,'author@fixture.invalid','Author',5),(3,'blocked@fixture.invalid','Blocked',5);
    INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (3,1);
    INSERT INTO wp_rooms(id,slug,name,kind) VALUES (1,'general','General','general'),(2,'other','Other','general');
    INSERT INTO wp_posts(id,author_id,room_id,kind,body,status) VALUES
      (1,2,1,'poll','first poll','visible'),(2,2,1,'text','first question','visible'),(3,2,1,'build','first build','visible'),
      (4,3,1,'poll','blocked poll','visible'),(5,2,1,'poll','held poll','held'),(6,2,2,'build','another room','visible'),
      (7,2,1,'text','mentions questions','visible');
    INSERT INTO wp_decisions(post_id,champion,role,topic) VALUES (2,'Ashe','Bottom','Macro');
    INSERT INTO wp_posts(id,author_id,room_id,kind,body,status)
      SELECT n,2,1,'text','newer thread','visible' FROM generate_series(100,139) n;
  `);
}, 30000);
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

it("filters before the room page limit and uses the same visibility rules as All", async () => {
  const ids = async (param: unknown, viewerId: number | null) =>
    (await readRoomFeed(1, viewerId, roomFeedFromParam(param))).map(p => p.id);
  expect(await ids("all", 1)).toHaveLength(30);
  expect(await ids("all", 1)).not.toContain(1);
  expect(await ids("polls", 1)).toEqual([1]);
  expect(await ids("polls", null)).toEqual([4, 1]);
  expect(await ids("questions", 1)).toEqual([2]);
  expect(await ids("builds", 1)).toEqual([3]);
  await q`UPDATE wp_rooms SET safety_status='held' WHERE id=1`;
  expect(await ids("questions", 1)).toEqual([]);
});

it("reopens the canonical room for invalid or repeated filter parameters", () => {
  for (const value of ["unknown", "", undefined, ["polls", "questions"]]) {
    expect(roomFeedHref("champ-ashe", roomFeedFromParam(value).key)).toBe("/rooms/champ-ashe");
  }
  expect(roomFeedHref("champ-ashe", roomFeedFromParam("questions").key)).toBe("/rooms/champ-ashe?feed=questions");
});

it("surfaces champion builds from visible rooms and site-wide posts without exposing held or blocked authors", async () => {
  await postgres.exec(`
    INSERT INTO wp_rooms(id,slug,name,kind,safety_status) VALUES
      (10,'lane-practice','Lane practice','general','visible'),(11,'closed-room','Closed room','general','held');
    INSERT INTO wp_posts(id,author_id,room_id,kind,body,status,data,created_at) VALUES
      (201,2,NULL,'build','Site-wide Ashe','visible','{"champion":"Ashe"}',now()),
      (202,2,10,'build','Ashe from Lane practice','visible','{"champion":"Ashe"}',now()),
      (203,2,11,'build','Held room Ashe','visible','{"champion":"Ashe"}',now()),
      (204,3,NULL,'build','Blocked Ashe','visible','{"champion":"Ashe"}',now()),
      (205,2,NULL,'build','Another champion','visible','{"champion":"Nami"}',now()),
      (206,2,NULL,'build','Held Ashe post','held','{"champion":"Ashe"}',now());
  `);
  const posts = await buildFeed({ id: 1 } as User, { champion: "Ashe" }, 12);
  expect(posts.map(post => [post.id, post.roomSlug])).toEqual([[202,"lane-practice"], [201,null]]);
  expect((await buildFeed({ id: 1 } as User, { champion: "Ashe" }, 1)).map(post => post.id)).toEqual([202]);
});

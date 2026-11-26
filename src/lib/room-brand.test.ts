import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { APP_NAME } from "./brand";
import { getSql, q, schemaStatements } from "./db";
import { PATCH_PUBLISHER } from "./patch-notes";
import { ensureRooms, getRoom, listFeaturedRooms, listRooms } from "./rooms";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
vi.mock("./riot", () => ({ championCatalog: async () => ({ list: [], current: true }) }));

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/rooms");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`SELECT 1`;
}, 30_000);

afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});

it("renames the existing general room in place and preserves other room settings", async () => {
  const [member] = await q`INSERT INTO wp_users(email,display_name) VALUES ('player@fixture.invalid','Player') RETURNING id`;
  const [general] = await q`INSERT INTO wp_rooms(slug,name) VALUES ('general','General') RETURNING id`;
  await q`INSERT INTO wp_room_members(room_id,user_id) VALUES (${general.id},${member.id})`;
  await q`INSERT INTO wp_rooms(slug,name,description) VALUES ('patch-meta','Patch Room','Editorial description')`;
  await ensureRooms();
  expect(await q`SELECT r.id,r.name,m.user_id FROM wp_rooms r JOIN wp_room_members m ON m.room_id=r.id WHERE r.slug='general'`)
    .toEqual([{ id: general.id, name: `The ${APP_NAME}`, user_id: member.id }]);
  expect(await q`SELECT name,description FROM wp_rooms WHERE slug='patch-meta'`)
    .toEqual([{ name: "Patch Room", description: "Editorial description" }]);
  await q`UPDATE wp_rooms SET name='Under review', description='',safety_status='held' WHERE slug='general'`;
  // Seeding refreshes the catalog after six hours.
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 7*60*60_000);
  try {
    await ensureRooms();
    expect(await q`SELECT name,description,safety_status FROM wp_rooms WHERE slug='general'`)
      .toEqual([{ name: "Under review", description: "", safety_status: "held" }]);
  } finally {
    clock.mockRestore();
  }
});

it("updates the reserved publisher before the first read while preserving namesakes and moderation holds", async () => {
  const [publisher] = await q`INSERT INTO wp_users(email,display_name) VALUES (${PATCH_PUBLISHER},'Former name') RETURNING id`;
  const [player] = await q`INSERT INTO wp_users(email,display_name) VALUES ('namesake@fixture.invalid','Former name') RETURNING id`;
  const [post] = await q`INSERT INTO wp_posts(author_id,body) VALUES (${publisher.id},'Existing briefing') RETURNING id`;
  const sql = await getSql();
  await sql.transaction(schemaStatements(sql));
  expect(await q`SELECT u.display_name,u.avatar_hue,p.author_id FROM wp_posts p JOIN wp_users u ON u.id=p.author_id WHERE p.id=${post.id}`)
    .toEqual([{display_name: APP_NAME, avatar_hue: 265, author_id: publisher.id}]);
  expect(await q`SELECT display_name FROM wp_users WHERE id=${player.id}`).toEqual([{display_name: "Former name"}]);
  await q`UPDATE wp_users SET safety_status='held',display_name='Profile under review' WHERE id=${publisher.id}`;
  await sql.transaction(schemaStatements(sql));
  expect(await q`SELECT display_name FROM wp_users WHERE id=${publisher.id}`).toEqual([{display_name: "Profile under review"}]);
});

it("only reports member and latest-post activity a viewer may see", async () => {
  await ensureRooms();
  const [lab] = await q`SELECT id FROM wp_rooms WHERE slug='off-meta-lab'`;
  const roomId = Number(lab.id);
  await q`INSERT INTO wp_users(id,email,display_name,banned_until) VALUES
    (101,'visible@fixture.invalid','Visible',NULL),(102,'blocked@fixture.invalid','Blocked',NULL),
    (103,'muted@fixture.invalid','Muted',NULL),(104,'banned@fixture.invalid','Banned',now()+interval '1 hour')`;
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (102,101)`;
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES (101,103)`;
  await q`INSERT INTO wp_room_members(room_id,user_id) SELECT ${roomId},id FROM wp_users WHERE id BETWEEN 101 AND 104`;
  await q`INSERT INTO wp_posts(id,author_id,room_id,body,status,created_at,withdrawn_at) VALUES
    (201,101,${roomId},'Visible','visible','2025-01-01',NULL),
    (202,102,${roomId},'Blocked','visible','2025-01-02',NULL),
    (203,103,${roomId},'Muted','visible','2025-01-03',NULL),
    (204,104,${roomId},'Banned','visible','2025-01-04',NULL),
    (205,101,${roomId},'Held','held','2025-01-05',NULL),
    (206,101,${roomId},'Withdrawn','visible','2025-01-06','2025-01-07')`;
  const labRow = (rooms: Awaited<ReturnType<typeof listFeaturedRooms>>) => rooms.find(room => room.slug === "off-meta-lab");
  expect(labRow(await listFeaturedRooms(101))).toMatchObject({ members: 1, joined: true, latestPost: { id: 201 } });
  expect(labRow(await listFeaturedRooms())).toMatchObject({ members: 3, latestPost: { id: 203 } });
  expect(labRow(await listRooms(101, 10, "Off-Meta"))).not.toHaveProperty("latestPost");
  await q`UPDATE wp_rooms SET safety_status='held' WHERE id=${roomId}`;
  expect(labRow(await listFeaturedRooms(101))).toBeUndefined();
  expect(await getRoom("off-meta-lab", 101)).toBeNull();
});

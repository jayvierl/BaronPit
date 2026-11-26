import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { APP_NAME } from "./brand";
import { getSql, q, schemaStatements } from "./db";
import { PATCH_PUBLISHER } from "./patch-notes";
import { ensureRooms } from "./rooms";

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

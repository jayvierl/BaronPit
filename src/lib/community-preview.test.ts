import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { APP_NAME } from "./brand";
import { profileMetadata, roomMetadata, unavailableCommunityPreview } from "./community-preview";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
vi.mock("./riot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./riot")>()),
  championCatalog: async () => ({ list: [], current: true }),
}));

let profileId: number;
let viewerId: number;

beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("APP_ORIGIN", "https://community.example");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/previews");
  const [profile, viewer] = await q`INSERT INTO wp_users(email,display_name,bio) VALUES
    ('roomer@fixture.invalid','Roomer','Keep this biography on my profile'),
    ('reader@fixture.invalid','Reader','') RETURNING id`;
  profileId = Number(profile.id);
  viewerId = Number(viewer.id);
  await q`INSERT INTO wp_rooms(slug,name,description) VALUES('solo-queue','Solo queue','What did you learn this week?')`;
}, 30_000);

afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});

it("unfurls a room using the public title, description and approved branded image", async () => {
  const result = await roomMetadata("solo-queue");
  const url = "https://community.example/rooms/solo-queue";
  const image = "https://community.example/baron-hero.png";
  expect(result.alternates?.canonical).toBe(url);
  expect(result.openGraph).toMatchObject({
    type:"website", url, title:`Solo queue · ${APP_NAME}`, description:"What did you learn this week?",
    images:[{url:image, width:1376, height:768}],
  });
  expect(result.twitter).toMatchObject({card:"summary_large_image", images:[image]});
  await q`UPDATE wp_rooms SET safety_status='held' WHERE slug='solo-queue'`;
  expect(await roomMetadata("solo-queue")).toEqual(unavailableCommunityPreview);
  expect(await roomMetadata("missing")).toEqual(unavailableCommunityPreview);
});

it("shares a public display name while respecting blocks and later moderation", async () => {
  const result = await profileMetadata(String(profileId), null);
  expect(result.openGraph).toMatchObject({
    type:"profile", url:`https://community.example/u/${profileId}`, title:`Roomer · ${APP_NAME}`,
  });
  expect(JSON.stringify(result)).not.toMatch(/biography|fixture.invalid/);
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(${profileId},${viewerId})`;
  expect(await profileMetadata(String(profileId), viewerId)).toEqual(unavailableCommunityPreview);
  await q`UPDATE wp_users SET banned_until=now()+interval '1 hour' WHERE id=${profileId}`;
  expect(await profileMetadata(String(profileId), null)).toEqual(unavailableCommunityPreview);
  await q`UPDATE wp_users SET banned_until=null,safety_status='held' WHERE id=${profileId}`;
  expect(await profileMetadata(String(profileId), null)).toEqual(unavailableCommunityPreview);
  expect(await profileMetadata("not-a-profile", null)).toEqual(unavailableCommunityPreview);
});

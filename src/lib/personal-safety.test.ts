import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as unlink } from "../app/api/account/unlink/route";
import { POST as block } from "../app/api/social/block/route";
import { POST as mute } from "../app/api/social/mute/route";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { personalSafetyLists } from "./personal-safety";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
const session = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: session.token }) }) }));

const token = "a".repeat(64);
const origin = "https://app.test";

function write(path: string, body: object, writeOrigin = origin) {
  return new Request(origin + "/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: writeOrigin },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://local.invalid/safety-test");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "true");
  await q`INSERT INTO wp_users(id,email,display_name) VALUES
    (1,'owner@example.test','Onyx'),(2,'block@example.test','Brick'),(3,'mute@example.test','Moss'),(4,'hidden@example.test','Private name')`;
  // The actor has a valid session, stale terms and an active restriction during the publication pause.
  await q`UPDATE wp_users SET banned_until=now()+interval '1 day' WHERE id=1`;
  await q`UPDATE wp_users SET safety_status='removed' WHERE id=4`;
  await q`INSERT INTO wp_sessions(user_id,token_hash,expires_at)
    VALUES(1,${createHash("sha256").update(token).digest("hex")},now()+interval '1 day')`;
}, 30000);

beforeEach(async () => {
  session.token = token;
  await q`TRUNCATE wp_blocks,wp_mutes,wp_follows,wp_players,wp_lfg CASCADE`;
});

afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});

describe("private safety settings", () => {
  it("returns only outgoing settings and withholds the hidden player's name", async () => {
    await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (1,2),(2,3),(4,1)`;
    await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES (1,3),(1,4),(2,1)`;

    expect(await personalSafetyLists(1)).toEqual({
      blocked: [{ id: 2, name: "Brick" }],
      muted: [{ id: 3, name: "Moss" }, { id: 4, name: "Unavailable player #4" }],
    });
    expect(await personalSafetyLists(2)).toEqual({ blocked: [{ id: 3, name: "Moss" }], muted: [{ id: 1, name: "Onyx" }] });
    expect(await personalSafetyLists(3)).toEqual({ blocked: [], muted: [] });
  });

  it("unblocks only the actor's settings and closes legacy access, even with a restriction and publication pause", async () => {
    await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (1,2),(2,1),(3,1)`;
    await q`INSERT INTO wp_follows(follower_id,followee_id) VALUES (1,2),(2,1),(1,3)`;
    await q`INSERT INTO wp_lfg(id,user_id,puuid) VALUES (11,1,'owner'),(12,3,'third')`;
    await q`INSERT INTO wp_duo_requests(listing_id,sender_id,sender_puuid,status)
      VALUES (11,2,'blocked','accepted'),(12,1,'owner','accepted')`;

    expect((await block(write("social/block", { userId: 2, block: false }, "https://different.test"))).status).toBe(403);
    expect((await block(write("social/block", { userId: 3, block: false }))).status).toBe(200);
    expect((await block(write("social/block", { userId: 2, block: false }))).status).toBe(200);
    expect(await q`SELECT blocker_id,blocked_id FROM wp_blocks ORDER BY blocker_id`).toEqual([
      { blocker_id: 2, blocked_id: 1 }, { blocker_id: 3, blocked_id: 1 },
    ]);
    expect(await q`SELECT follower_id,followee_id FROM wp_follows`).toEqual([{ follower_id: 1, followee_id: 3 }]);
    expect(await q`SELECT listing_id,status FROM wp_duo_requests ORDER BY listing_id`).toEqual([
      { listing_id: 11, status: "declined" }, { listing_id: 12, status: "accepted" },
    ]);
  });

  it("unmutes only the actor's settings and preserves existing relationships", async () => {
    await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES(1,2),(2,1)`;
    await q`INSERT INTO wp_follows(follower_id,followee_id) VALUES(1,2)`;
    await q`INSERT INTO wp_lfg(id,user_id,puuid) VALUES(11,1,'owner')`;
    await q`INSERT INTO wp_duo_requests(listing_id,sender_id,sender_puuid,status) VALUES(11,2,'other','accepted')`;

    session.token = "";
    expect((await mute(write("social/mute", { userId: 2, mute: false }))).status).toBe(401);
    session.token = token;
    expect((await mute(write("social/mute", { userId: 2, mute: false }))).status).toBe(200);
    expect(await q`SELECT muter_id,muted_id FROM wp_mutes`).toEqual([{ muter_id: 2, muted_id: 1 }]);
    expect(await q`SELECT follower_id,followee_id FROM wp_follows`).toEqual([{ follower_id: 1, followee_id: 2 }]);
    expect(await q`SELECT status FROM wp_duo_requests`).toEqual([{ status: "accepted" }]);
  });

  it("allows unlinking only the actor's Riot ID and reassigns primary after a real removal", async () => {
    await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line) VALUES
      ('main','na1','Main','NA1'),('second','na1','Second','NA1'),('other','na1','Other','NA1')`;
    await q`INSERT INTO wp_links(user_id,puuid,is_primary) VALUES (1,'main',false),(1,'second',false),(2,'other',true)`;

    expect((await unlink(write("account/unlink", { puuid: "main" }, "https://different.test"))).status).toBe(403);
    expect((await unlink(write("account/unlink", { puuid: "other", userId: 2 }))).status).toBe(200);
    expect(await q`SELECT user_id,puuid FROM wp_links WHERE is_primary`).toEqual([{ user_id: 2, puuid: "other" }]);
    await q`UPDATE wp_links SET is_primary=true WHERE user_id=1 AND puuid='main'`;
    expect((await unlink(write("account/unlink", { puuid: "main" }))).status).toBe(200);
    expect(await q`SELECT user_id,puuid,is_primary FROM wp_links ORDER BY user_id`).toEqual([
      { user_id: 1, puuid: "second", is_primary: true }, { user_id: 2, puuid: "other", is_primary: true },
    ]);
  });
});

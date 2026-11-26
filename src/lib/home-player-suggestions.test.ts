import { createHash } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { POST as writeFollow } from "../app/api/social/follow/route";
import { TERMS_VERSION } from "./account-policy";
import { q } from "./db";
import { homePlayerSuggestions } from "./home-player-suggestions";
import { PATCH_PUBLISHER } from "./patch-notes";
import { isFollowing } from "./relationships";
import { safeReturnTo, signInHref } from "./signin-return";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
const session = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: session.token }) }) }));

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/suggestions");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false");
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at)
    SELECT i,'p'||i||'@example.test','Player '||i,'adult',${TERMS_VERSION},now() FROM generate_series(1,23) i`;
  await q`UPDATE wp_users SET age_band='teen' WHERE id=6`;
  await q`UPDATE wp_users SET age_band=NULL WHERE id=7`;
  await q`UPDATE wp_users SET safety_status='held' WHERE id=8`;
  await q`UPDATE wp_users SET banned_until=now()+interval '1 hour' WHERE id=9`;
  await q`UPDATE wp_users SET email=${PATCH_PUBLISHER} WHERE id=14`;
  await q`UPDATE wp_users SET terms_version='earlier' WHERE id=21`;
  await q`UPDATE wp_users SET terms_accepted_at=NULL WHERE id=22`;
  await q`INSERT INTO wp_rooms(id,slug,name,safety_status) VALUES (10,'held','Held room','held')`;
  await q`INSERT INTO wp_posts(id,author_id,created_at,body)
    SELECT i,i,now()-make_interval(mins=>25-i),'Public fixture' FROM generate_series(1,23) i`;
  await q`INSERT INTO wp_posts(id,author_id,created_at,body) VALUES
    (202,2,now()-interval '21 minutes 30 seconds','Latest post by Player 2')`;
  await q`UPDATE wp_posts SET created_at=now()-interval '20 days' WHERE id=13`;
  await q`UPDATE wp_posts SET created_at=now()+interval '1 day' WHERE id=23`;
  await q`UPDATE wp_posts SET room_id=10 WHERE id=10`;
  await q`UPDATE wp_posts SET status='held' WHERE id=11`;
  await q`UPDATE wp_posts SET withdrawn_at=now() WHERE id=12`;
  await q`UPDATE wp_posts SET data='{"briefing":true}'::jsonb WHERE id=15`;
  await q`INSERT INTO wp_follows(follower_id,followee_id) VALUES (1,16)`;
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (17,1),(1,18)`;
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES (1,19),(20,1)`;
}, 30_000);

afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});

it("returns at most three distinct adults with visible human posts, excluding existing follows and reciprocal blocks or mutes", async () => {
  expect((await homePlayerSuggestions(1)).map(({ id, postId }) => [id, postId])).toEqual([[5, 5], [4, 4], [2, 202]]);
});

it("only returns the public profile and evidence link fields to guests", async () => {
  const guests = await homePlayerSuggestions(null);
  expect(guests.map(({ id }) => id)).toEqual([20, 19, 18]);
  expect(guests[0]).toEqual({ id: 20, name: "Player 20", hue: expect.any(Number), avatar: { kind: "initials" }, postId: 20 });
  const profilePath = `/u/${guests[0].id}`;
  const destination = new URL(signInHref(profilePath), "https://app.test");
  expect(destination.pathname).toBe("/signin");
  expect(safeReturnTo(destination.searchParams.get("next"))).toBe(profilePath);
});

it("follows a suggestion through the signed-in action and lets the player unfollow from the profile", async () => {
  const token = "a".repeat(64);
  await q`INSERT INTO wp_sessions(user_id,token_hash,expires_at)
    VALUES(1,${createHash("sha256").update(token).digest("hex")},now()+interval '1 day')`;
  const [candidate] = await homePlayerSuggestions(1);
  expect(await isFollowing(1, candidate.id)).toBe(false);
  const toggle = (follow: boolean) => writeFollow(new Request("https://app.test/api/social/follow", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://app.test" },
    body: JSON.stringify({ userId: candidate.id, follow }),
  }));

  expect((await toggle(true)).status).toBe(401);
  session.token = token;
  try {
    expect(await (await toggle(true)).json()).toEqual({ ok: true, active: true });
    expect(await isFollowing(1, candidate.id)).toBe(true);
    expect((await homePlayerSuggestions(1)).map(({ id }) => id)).not.toContain(candidate.id);

    expect(await (await toggle(false)).json()).toEqual({ ok: true, active: false });
    expect(await isFollowing(1, candidate.id)).toBe(false);
    expect((await homePlayerSuggestions(1)).map(({ id }) => id)).toContain(candidate.id);
  } finally {
    session.token = "";
  }
});

it("does not recommend anyone when eligible adult accounts have no recent visible posts", async () => {
  await q`UPDATE wp_posts SET status='held' WHERE author_id IN (2,3,4,5)`;
  expect(await homePlayerSuggestions(1)).toEqual([]);
});

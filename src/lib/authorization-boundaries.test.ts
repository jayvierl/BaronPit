import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as withdraw } from "../app/api/social/withdraw/route";
import { POST as unlink } from "../app/api/account/unlink/route";
import { POST as createPost } from "../app/api/social/post/route";
import { POST as createComment } from "../app/api/social/comments/route";
import { POST as updateProfile } from "../app/api/account/profile/route";
import { postgres } from "../../test/postgres";
import { TERMS_VERSION } from "./account-policy";
import { q } from "./db";

// Cross-account authorization boundaries: ownership in this app is enforced by
// query scoping (mutations carry the signed-in user's id), which historically
// had almost no two-account test coverage. These tests pin the current correct
// behavior: a signed-in user B must never be able to mutate user A's objects.
vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));

const fixture = vi.hoisted(() => ({ token: () => undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: fixture.token() }) }) }));

const cookies = new AsyncLocalStorage<string>();
fixture.token = () => cookies.getStore();
const origin = "https://authz.example.test";
const tokenA = "7".repeat(64);
const tokenB = "8".repeat(64);
const as = <T>(token: string, run: () => Promise<T>) => cookies.run(token, run);

function write(path: string, body: unknown) {
  return new Request(origin + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

const A_POST = 101;
const A_COMMENT = 201;
const A_PUUID = "puuid-author-a";
const B_PUUID = "puuid-intruder-b";

beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/inert-test");
  vi.stubEnv("MODERATION_OPENAI_API_KEY", "");
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false");
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at,created_at) VALUES
    (1,'author-a@authz.test','Author A','adult',${TERMS_VERSION},now(),now()-interval '5 days'),
    (2,'intruder-b@authz.test','Intruder B','adult',${TERMS_VERSION},now(),now()-interval '5 days')`;
  for (const [id, token] of [[1, tokenA], [2, tokenB]] as const) {
    await q`INSERT INTO wp_sessions(user_id,token_hash,expires_at)
      VALUES(${id},${createHash("sha256").update(token).digest("hex")},now()+interval '1 day')`;
  }
  await q`INSERT INTO wp_rooms(id,slug,name,kind) VALUES (11,'authz-room','Wave timing','general')`;
  await q`INSERT INTO wp_posts(id,author_id,room_id,kind,body,status) VALUES
    (${A_POST},1,11,'text','Author A post about freezing the wave.','visible')`;
  await q`INSERT INTO wp_comments(id,post_id,author_id,body,status) VALUES
    (${A_COMMENT},${A_POST},1,'Author A reply about the freeze.','visible')`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line) VALUES
    (${A_PUUID},'na1','AuthorA','NA1'), (${B_PUUID},'na1','IntruderB','NA1')`;
  await q`INSERT INTO wp_links(user_id,puuid,is_primary,verified) VALUES
    (1,${A_PUUID},true,false), (2,${B_PUUID},true,false)`;
}, 30000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});

describe("cross-account authorization boundaries", () => {
  it("a non-owner cannot withdraw someone else's post (404, post untouched); the owner can", async () => {
    const attempt = await as(tokenB, () => withdraw(write("/api/social/withdraw", { kind: "post", id: A_POST })));
    expect(attempt.status).toBe(404);
    const [after] = await q`SELECT body, withdrawn_at FROM wp_posts WHERE id=${A_POST}`;
    expect(after.body).toBe("Author A post about freezing the wave.");
    expect(after.withdrawn_at).toBeNull();

    const control = await as(tokenA, () => withdraw(write("/api/social/withdraw", { kind: "post", id: A_POST })));
    expect(control.status).toBe(200);
    const [done] = await q`SELECT withdrawn_at FROM wp_posts WHERE id=${A_POST}`;
    expect(done.withdrawn_at).not.toBeNull();
  });

  it("a non-owner cannot withdraw someone else's comment (404, comment untouched); the owner can", async () => {
    const attempt = await as(tokenB, () => withdraw(write("/api/social/withdraw", { kind: "comment", id: A_COMMENT })));
    expect(attempt.status).toBe(404);
    const [after] = await q`SELECT body, withdrawn_at FROM wp_comments WHERE id=${A_COMMENT}`;
    expect(after.body).toBe("Author A reply about the freeze.");
    expect(after.withdrawn_at).toBeNull();

    const control = await as(tokenA, () => withdraw(write("/api/social/withdraw", { kind: "comment", id: A_COMMENT })));
    expect(control.status).toBe(200);
    const [done] = await q`SELECT withdrawn_at FROM wp_comments WHERE id=${A_COMMENT}`;
    expect(done.withdrawn_at).not.toBeNull();
  });

  it("unlinking is scoped to the signed-in account: B cannot remove A's Riot link", async () => {
    // The route is an idempotent no-op for puuids the caller does not own, so
    // the pinned property is the state afterwards: A's link must survive.
    const attempt = await as(tokenB, () => unlink(write("/api/account/unlink", { puuid: A_PUUID })));
    expect(attempt.status).toBe(200);
    expect(await q`SELECT user_id, puuid FROM wp_links WHERE user_id=1 AND puuid=${A_PUUID}`).toHaveLength(1);

    const ownControl = await as(tokenB, () => unlink(write("/api/account/unlink", { puuid: B_PUUID })));
    expect(ownControl.status).toBe(200);
    expect(await q`SELECT user_id FROM wp_links WHERE user_id=2 AND puuid=${B_PUUID}`).toHaveLength(0);
    expect(await q`SELECT user_id, puuid FROM wp_links WHERE user_id=1 AND puuid=${A_PUUID}`).toHaveLength(1);

    const ownerControl = await as(tokenA, () => unlink(write("/api/account/unlink", { puuid: A_PUUID })));
    expect(ownerControl.status).toBe(200);
    expect(await q`SELECT user_id FROM wp_links WHERE user_id=1 AND puuid=${A_PUUID}`).toHaveLength(0);
  });

  it("post and comment creation cannot be attributed to another account (409)", async () => {
    const before = await q`SELECT count(*)::int AS n FROM wp_posts WHERE author_id=1`;
    const post = await as(tokenB, () => createPost(write("/api/social/post", {
      kind: "text", body: "A perfectly ordinary post about wave management.", expectedAuthorId: 1,
    })));
    expect(post.status).toBe(409);
    const comment = await as(tokenB, () => createComment(write("/api/social/comments", {
      postId: A_POST, body: "A perfectly ordinary reply.", expectedAuthorId: 1,
    })));
    expect(comment.status).toBe(409);
    expect(await q`SELECT count(*)::int AS n FROM wp_posts WHERE author_id=1`).toEqual(before);

    const control = await as(tokenB, () => createPost(write("/api/social/post", {
      kind: "text", body: "A perfectly ordinary post about wave management.", expectedAuthorId: 2,
    })));
    expect(control.status).toBe(200);
    expect(await control.json()).toMatchObject({ ok: true });
  });

  it("a profile update only ever changes the signed-in account", async () => {
    const res = await as(tokenB, () => updateProfile(write("/api/account/profile", { displayName: "Intruder Renamed" })));
    expect(res.status).toBe(200);
    const [a] = await q`SELECT display_name FROM wp_users WHERE id=1`;
    const [b] = await q`SELECT display_name FROM wp_users WHERE id=2`;
    expect(a.display_name).toBe("Author A");
    expect(b.display_name).toBe("Intruder Renamed");
  });
});

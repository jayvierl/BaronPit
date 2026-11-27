import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { POST } from "../app/api/social/quote/route";
import { POST as setReplyPolicy } from "../app/api/social/reply-policy/route";
import { POST as submitComment } from "../app/api/social/comments/route";
import { postgres } from "../../test/postgres";
import { TERMS_VERSION } from "./account-policy";
import { getCurrentUser } from "./auth";
import { q } from "./db";
import { changeLibrary, libraryState, publicDiscussion, replyActivity } from "./discussion-library";
import { readPosts } from "./post-reader";
import { feedByAuthor, getPost, listComments, searchAll } from "./social";
import { withdrawSubmission } from "./submissions";

const fixture = vi.hoisted(() => ({ token: () => undefined as string | undefined }));
vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: fixture.token() }) }) }));

const cookies = new AsyncLocalStorage<string>();
fixture.token = () => cookies.getStore();
const origin = "https://quote-fixture.example.test";
const tokens = ["2".repeat(64), "3".repeat(64), "4".repeat(64)];
const writer = tokens[0], reader = tokens[1], rookie = tokens[2];
const original = "I would preserve the cannon wave before taking the river.";
const commentary = "I prefer entering after the jungler shows on the opposite side.";

const input = (postId: number, body = commentary) => ({ postId, body, submissionId: randomUUID() });
function submit(body: Record<string, unknown>, token?: string, requestOrigin = origin) {
  const request = new Request(`${origin}/api/social/quote`, { method: "POST", headers: { origin: requestOrigin }, body: JSON.stringify(body) });
  return token ? cookies.run(token, () => POST(request)) : POST(request);
}
const viewer = (token: string) => cookies.run(token, getCurrentUser);

beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/quote-test");
  vi.stubEnv("MODERATION_OPENAI_API_KEY", "");
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false");
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at,created_at) VALUES
    (1,'original@example.invalid','Original author','adult',${TERMS_VERSION},now(),now()-interval '5 days'),
    (2,'writer@example.invalid','Writer','adult',${TERMS_VERSION},now(),now()-interval '5 days'),
    (3,'reader@example.invalid','Reader','adult',${TERMS_VERSION},now(),now()-interval '5 days'),
    (4,'rookie@example.invalid','Rookie','adult',${TERMS_VERSION},now(),now())`;
  for (const [index, token] of tokens.entries()) {
    await q`INSERT INTO wp_sessions(user_id,token_hash,expires_at)
      VALUES(${index+2},${createHash("sha256").update(token).digest("hex")},now()+interval '1 day')`;
  }
  await q`INSERT INTO wp_rooms(id,slug,name,kind) VALUES (11,'quote-room','Wave timing','general')`;
  await q`INSERT INTO wp_posts(id,author_id,room_id,kind,body,status) VALUES
    (101,1,11,'text',${original},'visible'), (102,1,11,'text','Already in review','held'),
    (103,1,11,'clip','Clip excerpt','visible'), (104,1,NULL,'text','Second idea','visible')`;
}, 30_000);

afterAll(async () => { vi.unstubAllEnvs(); await postgres.close(); });

it("links separate commentary once through the real post route and publishes only current source evidence", async () => {
  const draft = input(101);
  expect((await submit(draft)).status).toBe(401);
  expect((await submit(draft, writer, "https://other.example.test")).status).toBe(403);
  expect((await submit({ ...draft, expectedAuthorId: 1 }, writer)).status).toBe(409);
  expect((await submit({ ...draft, body: "   " }, writer)).status).toBe(400);
  expect((await submit({ ...draft, body: "A".repeat(1001) }, writer)).status).toBe(400);
  for (const postId of [102,103,200]) expect((await submit(input(postId), writer)).status).toBe(400);

  const responses = await Promise.all([submit({ ...draft, original: "Client supplied excerpt", roomId: 1 }, writer), submit(draft, writer)]);
  expect(responses.map(response => response.status)).toEqual([201,201]);
  const published = await Promise.all(responses.map(response => response.json()));
  expect(published[0]).toMatchObject({ ok: true, status: "visible" });
  expect(published[1]).toEqual(published[0]);
  const id: number = published[0].postId;
  expect((await submit({ ...draft, body: "Reused with another body" }, writer)).status).toBe(400);
  expect(await q`SELECT p.author_id,p.room_id,p.kind,p.body,p.data,qp.original_post_id,qp.original_author_id
    FROM wp_posts p JOIN wp_quote_posts qp ON qp.post_id=p.id WHERE p.id=${id}`).toEqual([
    { author_id: 2, room_id: 11, kind: "text", body: commentary, data: {}, original_post_id: 101, original_author_id: 1 },
  ]);
  expect(await getPost(id, null)).toMatchObject({ id, body: commentary, roomId: 11,
    quote: { original: { postId: 101, author: "Original author", body: original, room: "Wave timing" } } });
  expect((await publicDiscussion(id))?.body).toBe(commentary);
  expect((await searchAll("cannon wave", null, "posts")).posts.map(post => post.id)).toEqual([101]);
  expect((await replyActivity(1, null)).entries).toEqual([]);

  await q`UPDATE wp_posts SET status='held' WHERE id=101`;
  expect(await getPost(id, null)).toMatchObject({ quote: { original: null } });
  await q`UPDATE wp_posts SET status='visible' WHERE id=101`;
  expect((await getPost(id, null))?.quote?.original?.postId).toBe(101);

  const signedReader = await viewer(reader);
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES(3,1)`;
  expect(await getPost(id, signedReader)).toMatchObject({ quote: { original: null } });
  expect((await getPost(id, null))?.quote?.original?.postId).toBe(101);
  await q`DELETE FROM wp_mutes WHERE muter_id=3`;
  expect(await changeLibrary(3, "post", id, "save", true)).toBe(true);
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(1,3)`;
  expect(await getPost(id, signedReader)).toBeNull();
  expect(await feedByAuthor(2, signedReader)).toEqual([]);
  expect((await searchAll("jungler", signedReader, "posts")).posts).toEqual([]);
  expect(await publicDiscussion(id, 3)).toBeNull();
  expect(await libraryState(3, "post", id)).toBeNull();
  await q`DELETE FROM wp_blocks`;
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(2,1)`;
  expect(await getPost(id, await viewer(writer))).toBeNull();
  expect(await getPost(id, null)).toMatchObject({ quote: { original: null } });
  expect((await submit(input(101), writer)).status).toBe(400);
  await q`DELETE FROM wp_blocks`;

  await q`UPDATE wp_rooms SET safety_status='held' WHERE id=11`;
  expect(await getPost(id, null)).toBeNull();
  await q`UPDATE wp_rooms SET safety_status='visible' WHERE id=11`;
  expect(await withdrawSubmission(1, "post", 101)).toBe(true);
  const available = await getPost(id, null);
  expect(available).toMatchObject({ body: commentary, quote: { original: null } });
  expect(JSON.stringify(available)).not.toContain(original);
  expect(await (await submit(draft, writer)).json()).toEqual(published[0]);
  await q`DELETE FROM wp_posts WHERE id=101`;
  expect((await getPost(id, null))?.quote).toEqual({ original: null });
  expect(await withdrawSubmission(2, "post", id)).toBe(true);
  expect(await getPost(id, null)).toBeNull();
});

it("keeps a new author's quote in review while retaining the server-validated pointer", async () => {
  // Borderline wording from the new author, submitted for review: the path
  // that still lands a quote in the held state at publish time.
  const response = await submit(
    { ...input(104, "fuck shit, what would change if their jungler had already recalled?"), submitForReview: true },
    rookie,
  );
  expect(response.status).toBe(201);
  const { postId, status } = await response.json();
  expect(status).toBe("held");
  expect(await getPost(postId, null)).toBeNull();
  expect((await readPosts(4, { postId }, 1))[0]).toMatchObject({ status: "held", canQuote: false, quote: { original: { postId: 104 } } });
  expect(await q`SELECT action FROM wp_mod_log WHERE target_kind='post' AND target_id=${postId}`).toEqual([{ action: "hold" }]);

  await q`UPDATE wp_action_windows SET hits=array_fill(now(),ARRAY[12]) WHERE bucket='user:4:quote'`;
  const capped = await submit(input(104), rookie);
  expect(capped.status).toBe(429);
  expect((await capped.json()).error).toMatch(/12 quotes an hour/);
});

it("lets the author close and reopen replies while preserving existing replies and completed retries", async () => {
  await q`INSERT INTO wp_posts(id,author_id,room_id,kind,body,status)
    VALUES(111,2,11,'card','Discuss the objective timing','visible')`;
  function send(handler: typeof setReplyPolicy, path: string, body: Record<string, unknown>, token?: string, requestOrigin = origin) {
    const request = new Request(origin + path, {
      method: "POST", headers: { origin: requestOrigin }, body: JSON.stringify({ postId: 111, ...body }),
    });
    return token ? cookies.run(token, () => handler(request)) : handler(request);
  }
  const policy = (closed: boolean, token?: string, requestOrigin = origin) =>
    send(setReplyPolicy, "/api/social/reply-policy", { closed }, token, requestOrigin);
  const reply = (body: Record<string, unknown>) => send(submitComment, "/api/social/comments", body, reader);

  expect((await policy(true)).status).toBe(401);
  expect((await policy(true, reader)).status).toBe(404);
  expect((await policy(true, writer, "https://elsewhere.example.test")).status).toBe(403);
  const draft = { body: "I would check the wave first.", submissionId: randomUUID(), expectedAuthorId: 3 };
  const stale = await send(submitComment, "/api/social/comments", draft, writer);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ ok: false, error: expect.stringMatching(/signed-in account changed/i) });
  expect(await q`SELECT id FROM wp_comments WHERE submission_id=${draft.submissionId}`).toEqual([]);
  const first = await (await reply(draft)).json();
  expect(first).toMatchObject({ ok: true, status: "visible" });
  expect(await (await policy(true, writer)).json()).toEqual({ ok: true, closed: true });
  expect(await (await policy(true, writer)).json()).toEqual({ ok: true, closed: true });
  expect(await getPost(111, null)).toMatchObject({ repliesClosed: true });
  expect((await listComments(111, null)).map(comment => comment.id)).toEqual([first.commentId]);
  expect(await (await reply(draft)).json()).toEqual(first);
  for (const variant of [{}, { parentId: first.commentId }, { oneFix: true }]) {
    expect((await reply({ ...variant, body: "I agree the next wave is important." })).status).toBe(400);
  }
  expect((await listComments(111, null)).map(comment => comment.id)).toEqual([first.commentId]);
  await q`UPDATE wp_users SET banned_until=now()+interval '1 hour' WHERE id=2`;
  expect((await policy(true, writer)).status).toBe(200);
  expect((await policy(false, writer)).status).toBe(403);
  await q`UPDATE wp_users SET banned_until=NULL WHERE id=2`;
  expect((await policy(false, writer)).status).toBe(200);
  expect(await getPost(111, null)).toMatchObject({ repliesClosed: false });
  expect(await (await reply({ parentId: first.commentId, body: "What would you do with the next wave?" })).json()).toMatchObject({ok:true});
});

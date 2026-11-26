import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { librarySchema } from "./discussion-library-schema";
import { changeLibrary, hasUnreadReplies, libraryState, publicDiscussion, replyActivity, savedPlaybook, setReplyMode, watchedDiscussions } from "./discussion-library";
import { discussionMetadata } from "./discussion-library-preview";
import { profileReplies } from "./profile-replies";
import { addComment, listComments } from "./social";
import { withdrawSubmission } from "./submissions";
import type { User } from "./auth";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/library");
  vi.stubEnv("APP_ORIGIN", "https://community.example");
  vi.stubEnv("MODERATION_OPENAI_API_KEY", "");
  await q`SELECT 1`;
  await postgres.exec(librarySchema.join(";"));
}, 30000);
beforeEach(async () => {
  await postgres.exec("TRUNCATE wp_users, wp_rooms RESTART IDENTITY CASCADE");
  await postgres.exec(`
    INSERT INTO wp_users(id,email,display_name) VALUES (1,'1@example.invalid','Reader'),(2,'2@example.invalid','Author'),(3,'3@example.invalid','Second reader');
    INSERT INTO wp_rooms(id,slug,name) VALUES (1,'general','General');
    INSERT INTO wp_posts(id,author_id,room_id,body,status) VALUES (10,2,1,'When should I recall? https://external.invalid @summoner','visible'),(11,2,1,'held material','held');
    INSERT INTO wp_comments(id,post_id,author_id,body) VALUES (21,10,2,'Before dragon'),(22,10,1,'My own reply');
    INSERT INTO wp_comments(id,post_id,author_id,body,parent_id) VALUES (23,10,3,'Which wave?',21);
  `);
}, 30000);
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

describe("private discussion library", () => {
  it("saves posts and individual replies with independent identity, ownership and idempotency", async () => {
    expect(await changeLibrary(1, "post", 10, "save", true)).toBe(true);
    expect(await changeLibrary(1, "comment", 23, "save", true)).toBe(true);
    await changeLibrary(1, "comment", 23, "save", true);
    const page = await savedPlaybook(1, null);
    expect(page.entries.map(x => [x.kind, x.id, x.postId, x.authorId])).toEqual([["comment", 23, 10, 3], ["post", 10, 10, 2]]);
    expect((await savedPlaybook(1, page.entries[0].cursor)).entries.map(x => x.id)).toEqual([10]);
    await changeLibrary(3, "comment", 23, "save", false);
    expect((await libraryState(1, "comment", 23))?.saved).toBe(true);
    expect((await savedPlaybook(3, null)).entries).toEqual([]);
    expect(await changeLibrary(1, "post", 11, "save", true)).toBe(false);
  });
  it("tracks only new visible replies from other players and lets the recipient mark them read", async () => {
    await changeLibrary(1, "post", 10, "watch", true);
    expect((await replyActivity(1, null)).entries).toEqual([]);
    await postgres.exec("INSERT INTO wp_comments(id,post_id,author_id,body,parent_id) VALUES(24,10,2,'The cannon wave',23),(25,10,1,'Thanks',23)");
    await changeLibrary(1, "post", 10, "watch", true);
    expect((await replyActivity(1, null)).entries.map(x => [x.id, x.unread])).toEqual([[24, true]]);
    expect(await changeLibrary(2, "comment", 24, "read", true)).toBe(false);
    expect(await hasUnreadReplies(1)).toBe(true);
    expect(await changeLibrary(1, "comment", 24, "read", true)).toBe(true);
    expect(await hasUnreadReplies(1)).toBe(false);
    expect((await replyActivity(1, null)).entries[0].unread).toBe(false);
    expect((await watchedDiscussions(1, null)).entries[0].postId).toBe(10);
  });
  it("delivers direct answers to authors and direct replies to commenters without an explicit watch", async () => {
    expect((await libraryState(1, "post", 10))?.replyMode).toBe("direct");
    await postgres.exec("UPDATE wp_users SET display_name='Shared name' WHERE id IN (1,3)");
    expect((await replyActivity(2, null)).entries.map(e => [e.id,e.replyReason,e.author,e.authorId])).toEqual([
      [23,"comment","Shared name",3], [22,"post","Shared name",1],
    ]);
    expect((await replyActivity(1, null)).entries).toEqual([]);
    await setReplyMode(2, 10, "all");
    await postgres.exec("INSERT INTO wp_comments(id,post_id,author_id,body,parent_id) VALUES(24,10,3,'Top level',NULL),(25,10,3,'An answer to you',22),(26,10,2,'A follow-up',23)");
    expect((await replyActivity(2, null)).entries.map(e => [e.id,e.replyReason])).toEqual([[25,"watch"],[24,"post"],[23,"comment"],[22,"post"]]);
    expect((await replyActivity(2, "24")).entries.map(e => e.id)).toEqual([23,22]);
    expect((await replyActivity(1, null)).entries.map(e => [e.id,e.replyReason])).toEqual([[25,"comment"]]);
    expect(await changeLibrary(1, "comment", 24, "read", true)).toBe(false);
    expect(await changeLibrary(1, "comment", 25, "read", true)).toBe(true);
    expect(await hasUnreadReplies(1)).toBe(false);
    expect((await watchedDiscussions(1, null)).entries).toEqual([]);
  });
  it("addresses a nested comment by ID in Activity and public Replies and keeps retries idempotent", async () => {
    const sender: User = { id: 1, email: "1@example.invalid", displayName: "Reader", avatarHue: 1,
      bio: "", createdAt: "2025-01-01", bannedUntil: null, strikeCount: 0, ageBand: "adult", termsCurrent: true };
    await q`UPDATE wp_users SET display_name='Alice' WHERE id=2`;
    await q`UPDATE wp_users SET display_name='Bob' WHERE id=3`;
    const key = randomUUID();
    const send = (parentId = 23, submissionId = key) =>
      addComment(sender, 10, "Save that wave before dragon.", parentId, false, false, submissionId);
    const [reply, retry] = await Promise.all([send(),send()]);
    if (!reply.ok) throw Error(reply.error);
    expect(retry).toEqual(reply);
    expect(reply.status).toBe("visible");
    expect(await q`SELECT parent_id FROM wp_comments WHERE submission_id=${key}::uuid`).toEqual([{parent_id:23}]);
    expect(await send(21)).toMatchObject({ok:false, error:expect.stringContaining("different submission")});
    expect((await listComments(10,null))[0].replies[0].replies).toMatchObject([{id: reply.postId, parentId: 23}]);
    expect((await replyActivity(3,null)).entries).toMatchObject([{id:reply.postId, replyReason:"comment", unread:true}]);
    expect((await replyActivity(2,null)).entries.map(entry => entry.id)).not.toContain(reply.postId);
    expect(await changeLibrary(2,"comment",reply.postId,"read",true)).toBe(false);
    expect(await changeLibrary(3,"comment",reply.postId,"read",true)).toBe(true);
    expect((await profileReplies(1,null,null)).replies).toContainEqual(expect.objectContaining({id:reply.postId, recipient:"Bob"}));
    // An older reply still addresses the actual comment stored on its original row.
    expect((await profileReplies(3,null,null)).replies).toMatchObject([{id:23, recipient:"Alice"}]);

    await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(3,1)`;
    expect(await send(23,randomUUID())).toMatchObject({ok:false});
    expect((await replyActivity(3,null)).entries).toEqual([]);
    await q`DELETE FROM wp_blocks WHERE blocker_id=3 AND blocked_id=1`;
    expect(await withdrawSubmission(2,"comment",21)).toBe(true);
    expect((await replyActivity(3,null)).entries).toEqual([]);
    expect((await profileReplies(1,null,null)).replies.map(row => row.id)).not.toContain(reply.postId);
    expect(await send(23,randomUUID())).toMatchObject({ok:false});
    expect(await send()).toEqual(reply);
  });
  it("silences direct and watched replies per recipient and resumes without backfilling the muted period", async () => {
    expect(await setReplyMode(2,10,"muted")).toBe(true);
    await postgres.exec("INSERT INTO wp_comments(id,post_id,author_id,body) VALUES(24,10,1,'During mute')");
    expect(await hasUnreadReplies(2)).toBe(false);
    expect((await replyActivity(2,null)).entries).toEqual([]);
    expect((await watchedDiscussions(2,null,"muted")).entries.map(e => e.id)).toEqual([10]);
    expect((await libraryState(2,"post",10))?.replyMode).toBe("muted");
    expect(await changeLibrary(2,"comment",24,"read",true)).toBe(false);
    expect(await changeLibrary(2,"post",10,"mute",false)).toBe(true);
    expect(await hasUnreadReplies(2)).toBe(false);
    await setReplyMode(2,10,"all");
    await postgres.exec("INSERT INTO wp_comments(id,post_id,author_id,body) VALUES(25,10,1,'After unmute')");
    await setReplyMode(2,10,"all");
    expect((await replyActivity(2,null)).entries.map(e => [e.id,e.replyReason])).toEqual([[25,"post"]]);
    await setReplyMode(2,10,"muted");
    expect((await watchedDiscussions(2,null)).entries).toEqual([]);
    expect(await hasUnreadReplies(2)).toBe(false);
    await setReplyMode(2,10,"all");
    expect(await hasUnreadReplies(2)).toBe(false);
    expect((await watchedDiscussions(2,null,"muted")).entries).toEqual([]);
  });
  it("drops default notifications when a parent, author or room becomes unavailable", async () => {
    await postgres.exec("INSERT INTO wp_comments(id,post_id,author_id,body,parent_id) VALUES(24,10,3,'Reply to reader',22)");
    expect(await hasUnreadReplies(1)).toBe(true);
    await postgres.exec("UPDATE wp_comments SET status='held' WHERE id=22");
    expect(await hasUnreadReplies(1)).toBe(false);
    await postgres.exec("UPDATE wp_comments SET status='visible' WHERE id=22; INSERT INTO wp_mutes(muter_id,muted_id) VALUES(1,3)");
    expect((await replyActivity(1,null)).entries).toEqual([]);
    await postgres.exec("DELETE FROM wp_mutes; INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(3,1)");
    expect(await changeLibrary(1,"comment",24,"read",true)).toBe(false);
    await postgres.exec("DELETE FROM wp_blocks; UPDATE wp_rooms SET safety_status='held' WHERE id=1");
    expect(await hasUnreadReplies(1)).toBe(false);
    expect(await setReplyMode(1,10,"muted")).toBe(false);
  });
  it("rechecks ancestor, room and relationship visibility after an item was saved or watched", async () => {
    await changeLibrary(1, "post", 10, "save", true);
    await changeLibrary(1, "comment", 23, "save", true);
    await changeLibrary(1, "post", 10, "watch", true);
    await postgres.exec("INSERT INTO wp_comments(id,post_id,author_id,body,parent_id) VALUES(24,10,2,'Another reply',23)");
    expect((await replyActivity(1, null)).entries).toHaveLength(1);
    await postgres.exec("UPDATE wp_comments SET status='held' WHERE id=21");
    expect((await savedPlaybook(1, null)).entries.map(x => x.id)).toEqual([10]);
    expect((await replyActivity(1, null)).entries).toEqual([]);
    expect(await libraryState(1, "comment", 23)).toBeNull();
    await postgres.exec("UPDATE wp_comments SET status='visible' WHERE id=21; INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(2,1)");
    expect((await savedPlaybook(1, null)).entries).toEqual([]);
    expect((await watchedDiscussions(1, null)).entries).toEqual([]);
    expect(await changeLibrary(1, "post", 10, "watch", true)).toBe(false);
    expect(await changeLibrary(1, "post", 10, "watch", false)).toBe(true);
    await postgres.exec("DELETE FROM wp_blocks; UPDATE wp_rooms SET safety_status='held' WHERE id=1");
    expect(await publicDiscussion(10)).toBeNull();
    expect((await savedPlaybook(1, null)).entries).toEqual([]);
    expect(await changeLibrary(1, "comment", 23, "save", false)).toBe(true);
    await postgres.exec("UPDATE wp_rooms SET safety_status='visible' WHERE id=1");
    expect((await savedPlaybook(1, null)).entries.map(x => x.id)).toEqual([10]);
  });
  it("unfurls a real decision with champion, question and only the validated scoreboard", async () => {
    await postgres.exec(`
      INSERT INTO wp_posts(id,author_id,room_id,kind,body,card_validated,data) VALUES
        (30,2,1,'card','Should I recall after dragon?',true,
          '{"match":{"champion":"Ashe","win":true,"kills":2,"deaths":3,"assists":12},"puuid":"private-id","riotId":"private-name"}'),
        (31,2,1,'card','Legacy post',false,
          '{"match":{"champion":"Ashe","win":true,"kills":99,"deaths":0,"assists":11}}');
      INSERT INTO wp_decisions(post_id,champion,role,topic) VALUES (30,'Ashe','Support','Objective');
    `);
    const visible = await discussionMetadata("30");
    expect(visible.openGraph).toMatchObject({
      title: expect.stringContaining("Ashe Support question"),
      description: "Should I recall after dragon? — Ashe · Victory · 2/3/12 KDA",
    });
    expect(JSON.stringify(visible)).not.toMatch(/private-id|private-name/);
    expect((await discussionMetadata("31")).description).toBe("Legacy post");
    await postgres.exec("UPDATE wp_posts SET status='removed' WHERE id=30");
    expect((await discussionMetadata("30")).openGraph).toBeUndefined();
  });
  it("only generates public, absolute and sanitized link previews on the configured deployment", async () => {
    await postgres.exec("INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(2,1)");
    expect((await discussionMetadata("10", 1)).openGraph).toBeUndefined();
    const result = await discussionMetadata("10");
    expect(result.openGraph).toMatchObject({ type: "article", url: "https://community.example/post/10", description: "When should I recall?", images: [{ url: "https://community.example/discussion-card" }] });
    expect((await discussionMetadata("11")).openGraph).toBeUndefined();
    expect((await discussionMetadata("999999999999999999")).openGraph).toBeUndefined();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "branch.example");
    // This preview has no production DB binding.
    expect((await discussionMetadata("10")).openGraph).toBeUndefined();
    vi.stubEnv("WARD_PREVIEW_DATABASE_URL", "postgresql://fixture.invalid/preview");
    expect((await discussionMetadata("10")).openGraph).toMatchObject({ url: "https://branch.example/post/10" });
  });
});

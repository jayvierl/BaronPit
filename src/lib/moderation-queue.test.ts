import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { decideModerationTarget, listHeldItems } from "./moderation-queue";

vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../test/postgres")).neonForTests,
}));

const PHOTO_ID = "6a418a88-f08c-47db-93bf-7cc5014ac0c9";
const HASH = "abc0".repeat(16);

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://local-fixture.invalid/moderation-queue");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`INSERT INTO wp_users(id,email,display_name,created_at) VALUES
    (1,'established@fixtures.invalid','Established',now()-interval '30 days'),
    (2,'newcomer@fixtures.invalid','Newcomer',now())`;
  await q`INSERT INTO wp_posts(id,author_id,kind,body,status,clip_review_required) VALUES
    (101,1,'text','Borderline held post','held',false),
    (102,1,'text','Borderline published post','visible',false),
    (103,2,'text','Escalated held post','held',false),
    (104,1,'text','Already removed post','removed',false),
    (105,1,'text','Ordinary visible post','visible',false),
    (106,1,'clip','Held clip caption','held',true)`;
  await q`INSERT INTO wp_comments(id,post_id,author_id,body,status) VALUES
    (201,105,2,'Borderline held reply','held'),
    (202,105,1,'Borderline published reply','visible')`;
  await q`INSERT INTO wp_mod_log(target_kind,target_id,author_id,score,action,detail) VALUES
    ('post',101,1,45,'hold','link,profanity'),
    ('post',102,1,37,'flag','profanity'),
    ('post',103,2,50,'hold','link'),
    ('comment',201,2,41,'hold','profanity'),
    ('comment',202,1,33,'flag','profanity')`;
  await q`INSERT INTO wp_reports(reporter_id,target_kind,target_id,category,reason,status)
    VALUES (2,'post',101,'spam','Check this', 'open')`;
  await q`INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence)
    VALUES ('11111111-2222-4333-8444-555555555555','post',103,'threats','Restricted evidence')`;
  await q`INSERT INTO wp_profile_photos(id,user_id,uploader_id,original_hash,content_hash,needs_human,status,automated_clear)
    VALUES (${PHOTO_ID},1,1,${HASH},${HASH},true,'held',true)`;
}, 30000);

afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});

describe("held queue listing", () => {
  it("lists held and flagged work with score, hits, reports and trust state", async () => {
    const items = await listHeldItems();
    const byKey = new Map(items.map((i) => [i.targetType + ":" + String(i.targetId), i]));
    expect(byKey.get("post:101")).toMatchObject({
      state: "held", score: 45, hits: ["link", "profanity"], reports: 1, escalated: false,
      body: "Borderline held post",
    });
    expect(byKey.get("post:101")?.author).toMatchObject({ id: 1, lowTrust: false });
    expect(byKey.get("post:102")).toMatchObject({ state: "flagged", score: 37, reports: 0 });
    expect(byKey.get("comment:201")).toMatchObject({ state: "held", postId: 105 });
    expect(byKey.get("comment:201")?.author).toMatchObject({ id: 2, lowTrust: true });
    expect(byKey.get("comment:202")).toMatchObject({ state: "flagged" });
    expect(byKey.get("post:106")).toMatchObject({ state: "held", kind: "clip" });
    expect(byKey.has("post:104")).toBe(false);
    expect(byKey.has("post:105")).toBe(false);
  });

  it("never serves escalated content, only its metadata", async () => {
    const items = await listHeldItems();
    const escalated = items.find((i) => i.targetType === "post" && i.targetId === 103);
    expect(escalated).toMatchObject({ state: "held", escalated: true, body: null });
  });

  it("lists held profile photos as metadata only", async () => {
    const items = await listHeldItems();
    const media = items.find((i) => i.targetType === "media");
    expect(media).toMatchObject({ targetId: PHOTO_ID, state: "held", body: null, kind: "profile_photo" });
  });
});

describe("decisions", () => {
  it("approves a held post, closes its reports and writes the audit row", async () => {
    const result = await decideModerationTarget({
      targetType: "post", targetId: 101, decision: "approve", reason: "Approve: genuine first post",
    });
    expect(result).toEqual({ ok: true, priorStatus: "held", newStatus: "visible" });
    expect(await q`SELECT status FROM wp_posts WHERE id=101`).toEqual([{ status: "visible" }]);
    expect(await q`SELECT status,resolution FROM wp_reports WHERE target_kind='post' AND target_id=101`)
      .toEqual([{ status: "dismissed", resolution: "The review found no violation." }]);
    const log = await q`SELECT target_kind,target_id,decision,reason,actor,prior_status,new_status
      FROM wp_mod_decisions WHERE target_kind='post' AND target_id=101`;
    expect(log).toEqual([{
      target_kind: "post", target_id: 101, decision: "approve",
      reason: "Approve: genuine first post", actor: "lyris",
      prior_status: "held", new_status: "visible",
    }]);
  });

  it("denies a held comment into the same removed state the admin queue uses", async () => {
    const result = await decideModerationTarget({
      targetType: "comment", targetId: 201, decision: "deny", reason: "Deny: targeted harassment",
    });
    expect(result).toEqual({ ok: true, priorStatus: "held", newStatus: "removed" });
    expect(await q`SELECT status FROM wp_comments WHERE id=201`).toEqual([{ status: "removed" }]);
    expect(await q`SELECT decision FROM wp_mod_decisions WHERE target_kind='comment' AND target_id=201`)
      .toEqual([{ decision: "deny" }]);
  });

  it("approving a flagged item records the decision and clears it from the queue", async () => {
    const result = await decideModerationTarget({
      targetType: "post", targetId: 102, decision: "approve", reason: "Approve: mild profanity is allowed",
    });
    expect(result).toEqual({ ok: true, priorStatus: "visible", newStatus: "visible" });
    const items = await listHeldItems();
    expect(items.some((i) => i.targetType === "post" && i.targetId === 102)).toBe(false);
  });

  it("denies a held clip that is flagged for clip review", async () => {
    const result = await decideModerationTarget({
      targetType: "post", targetId: 106, decision: "deny", reason: "Deny: scam link",
    });
    expect(result).toEqual({ ok: true, priorStatus: "held", newStatus: "removed" });
  });

  it("refuses escalated targets and leaves them untouched for the safety owner", async () => {
    const result = await decideModerationTarget({
      targetType: "post", targetId: 103, decision: "deny", reason: "Deny: threats",
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(await q`SELECT status FROM wp_posts WHERE id=103`).toEqual([{ status: "held" }]);
    expect(await q`SELECT count(*)::int AS n FROM wp_mod_decisions WHERE target_id=103`).toEqual([{ n: 0 }]);
  });

  it("refuses items that are no longer awaiting a decision", async () => {
    expect(await decideModerationTarget({
      targetType: "post", targetId: 104, decision: "approve", reason: "Approve",
    })).toMatchObject({ ok: false, status: 409 });
    expect(await decideModerationTarget({
      targetType: "post", targetId: 101, decision: "deny", reason: "Deny",
    })).toMatchObject({ ok: false, status: 409 });
    expect(await decideModerationTarget({
      targetType: "post", targetId: 999, decision: "approve", reason: "Approve",
    })).toMatchObject({ ok: false, status: 404 });
  });

  it("keeps photo decisions in the admin photo queue", async () => {
    expect(await decideModerationTarget({
      targetType: "media", targetId: PHOTO_ID, decision: "approve", reason: "Approve",
    })).toMatchObject({ ok: false, status: 409 });
  });

  it("validates its input", async () => {
    expect(await decideModerationTarget({
      targetType: "post", targetId: 105, decision: "maybe", reason: "Because",
    })).toMatchObject({ ok: false, status: 400 });
    expect(await decideModerationTarget({
      targetType: "post", targetId: 105, decision: "approve", reason: "  ",
    })).toMatchObject({ ok: false, status: 400 });
    expect(await decideModerationTarget({
      targetType: "user", targetId: 1, decision: "approve", reason: "Approve",
    })).toMatchObject({ ok: false, status: 400 });
  });
});

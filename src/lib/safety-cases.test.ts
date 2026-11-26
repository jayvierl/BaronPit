import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import type { User } from "./auth";
import {
  escalateCase,
  fileReport,
  ownDecisions,
  resolveCase,
  reviewAppeal,
  reviewQueue,
  submitAppeal,
} from "./safety-cases";
vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../test/postgres")).neonForTests,
}));
const person = (id: number): User => ({
  id,
  email: `p${id}@example.test`,
  displayName: "test",
  avatarHue: 1,
  bio: "",
  createdAt: "2020-01-01",
  bannedUntil: null,
  strikeCount: 0,
  ageBand: "adult",
  termsCurrent: true,
});
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  vi.stubEnv("ADMIN_EMAILS", "p6@example.test,p7@example.test,p8@example.test");
  vi.stubEnv("SAFETY_OWNER_EMAILS", "p7@example.test,p8@example.test");
  await q`INSERT INTO wp_users(id,email,display_name) SELECT i,'p'||i||'@example.test','Player '||i FROM generate_series(1,8) i`;
  await q`INSERT INTO wp_posts(id,author_id,body,kind,status) VALUES (1,1,'Ordinary statement','text','visible'),(2,1,'Restricted test evidence','text','visible'),(3,2,'Private pending submission','media','held'),(4,1,'Another statement','text','visible')`;
});
afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});
describe("moderation decisions, reporter feedback and appeals", () => {
  it("deduplicates retrying reporters, refuses unknown items and independently verifies case review", async () => {
    expect((await fileReport(person(2), "post", 900, "spam", "missing")).status).toBe(404);
    expect((await fileReport(person(2), "post", 1, "spam", "context")).status).toBe(200);
    await fileReport(person(2), "post", 1, "spam", "retry");
    await fileReport(person(3), "post", 1, "spam", "");
    expect((await q`SELECT status FROM wp_posts WHERE id=1`)[0].status).toBe("visible");
    await fileReport(person(4), "post", 1, "spam", "");
    expect((await q`SELECT status FROM wp_posts WHERE id=1`)[0].status).toBe("held");
    expect(await resolveCase(person(2), "post", 1, "remove", "spam")).toBe(false);
    expect(await resolveCase(person(6), "post", 1, "restrict7", "spam")).toBe(true);
    expect(await resolveCase(person(6), "post", 1, "restrict7", "spam")).toBe(false);
    const reports = await q`SELECT status,decision_id FROM wp_reports WHERE target_id=1`;
    expect(reports).toHaveLength(3);
    expect(reports.every((r) => r.status === "actioned")).toBe(true);
    const [decision] = await ownDecisions(1);
    expect(decision.evidence).toBe("Ordinary statement");
    expect(await ownDecisions(2)).toHaveLength(0);
    expect(await submitAppeal(person(2), Number(decision.id), "another account")).toBe(false);
    expect(await submitAppeal(person(1), Number(decision.id), "Please check the context.")).toBe(true);
    expect(await submitAppeal(person(1), Number(decision.id), "duplicate")).toBe(false);
    const [appeal] = await q`SELECT id FROM wp_safety_appeals WHERE decision_id=${Number(decision.id)}`;
    expect(await reviewAppeal(person(6), Number(appeal.id), true, "original reviewer")).toBe(false);
    expect(await reviewAppeal(person(7), Number(appeal.id), true, "The example was in context.")).toBe(true);
    expect((await q`SELECT status FROM wp_posts WHERE id=1`)[0].status).toBe("visible");
    expect((await q`SELECT banned_until FROM wp_users WHERE id=1`)[0].banned_until).toBeNull();
    expect((await q`SELECT distinct status FROM wp_reports WHERE target_id=1`).map((r) => r.status)).toEqual([
      "corrected",
    ]);
  });
  it("isolates urgent cases, withholds sensitive evidence, and never releases native media", async () => {
    await fileReport(person(4), "post", 2, "child_safety", "Restricted sample note");
    const general = await reviewQueue(person(6)),
      owner = await reviewQueue(person(7));
    expect(general.cases.some((c) => Number(c.id) === 2 && c.kind === "post")).toBe(false);
    const item = owner.cases.find((c) => Number(c.id) === 2 && c.kind === "post");
    expect(item?.excerpt).toBeNull();
    expect(item?.note).toBeNull();
    expect(item?.receipt).toBeTruthy();
    expect(await resolveCase(person(6), "post", 2, "remove", "child_safety")).toBe(false);
    expect(await resolveCase(person(7), "post", 2, "remove", "child_safety")).toBe(true);
    expect((await ownDecisions(1)).find((d) => d.rule === "child_safety")?.evidence).toBeNull();
    expect(await resolveCase(person(7), "post", 3, "dismiss", "other")).toBe(false);
    expect((await q`SELECT status FROM wp_posts WHERE id=3`)[0].status).toBe("held");
    expect(
      (
        await q`SELECT count(*)::int AS n FROM wp_safety_urgent WHERE target_id=2 AND reviewed_at IS NOT NULL`
      )[0].n,
    ).toBe(1);
    const [d] = await q`SELECT id FROM wp_safety_decisions WHERE target_id=2 AND target_kind='post'`;
    expect(await submitAppeal(person(1), Number(d.id), "Please independently review this fixture.")).toBe(
      true,
    );
    const [a] = await q`SELECT id FROM wp_safety_appeals WHERE decision_id=${Number(d.id)}`;
    expect(
      await reviewAppeal(person(8), Number(a.id), true, "After review, the restriction was unwarranted."),
    ).toBe(true);
    expect((await q`SELECT status FROM wp_posts WHERE id=2`)[0].status).toBe("held");
    expect(
      (await q`SELECT count(*)::int AS n FROM wp_safety_urgent WHERE target_id=2 AND reviewed_at IS NULL`)[0]
        .n,
    ).toBe(1);
  });
  it("routes a new urgent concern from an existing held case to owners", async () => {
    await fileReport(person(2), "post", 4, "other", "");
    expect(await resolveCase(person(7), "post", 4, "remove", "private_information")).toBe(false);
    expect(await escalateCase(person(6), "post", 4, "private_information")).toBe(true);
    expect(await resolveCase(person(6), "post", 4, "dismiss", "other")).toBe(false);
    expect((await reviewQueue(person(6))).cases.some((c) => c.id === 4 && c.kind === "post")).toBe(false);
    expect((await q`SELECT status FROM wp_posts WHERE id=4`)[0].status).toBe("held");
    expect(await resolveCase(person(7), "post", 4, "dismiss", "other")).toBe("second_review");
    expect(await resolveCase(person(7), "post", 4, "dismiss", "other")).toBe(false);
    expect((await q`SELECT status FROM wp_posts WHERE id=4`)[0].status).toBe("held");
    expect(await resolveCase(person(8), "post", 4, "dismiss", "other")).toBe(true);
    expect((await q`SELECT status FROM wp_posts WHERE id=4`)[0].status).toBe("visible");
  });
  it("lets both participants report a declined invitation after blocking, and attributes each to the other participant", async () => {
    const [listing] =
      await q`INSERT INTO wp_lfg(user_id,puuid,status,note) VALUES(1,'fixture','closed','old note') RETURNING id`;
    const [inv] =
      await q`INSERT INTO wp_duo_requests(listing_id,sender_id,sender_puuid,status) VALUES(${Number(listing.id)},3,'other','declined') RETURNING id`;
    await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (1,3) ON CONFLICT DO NOTHING`;
    expect((await fileReport(person(2), "duo_request", Number(inv.id), "fraud", "unknown")).status).toBe(404);
    expect((await fileReport(person(1), "duo_request", Number(inv.id), "fraud", "incoming")).status).toBe(
      200,
    );
    expect((await fileReport(person(3), "duo_request", Number(inv.id), "fraud", "outgoing")).status).toBe(
      200,
    );
    expect(
      (
        await q`SELECT target_kind FROM wp_reports WHERE reason IN ('incoming','outgoing') ORDER BY reason`
      ).map((r) => r.target_kind),
    ).toEqual(["duo_request", "lfg"]);
  });
  it("redacts a reported profile and restores its previous display fields after clearance", async () => {
    await fileReport(person(1), "user", 5, "harassment", "");
    await fileReport(person(2), "user", 5, "harassment", "");
    await fileReport(person(3), "user", 5, "harassment", "");
    const [held] = await q`SELECT display_name,safety_status FROM wp_users WHERE id=5`;
    expect(held).toMatchObject({ display_name: "Community player", safety_status: "held" });
    expect(await resolveCase(person(6), "user", 5, "dismiss", "harassment")).toBe(true);
    expect((await q`SELECT display_name,safety_status FROM wp_users WHERE id=5`)[0]).toMatchObject({
      display_name: "Player 5",
      safety_status: "visible",
    });
  });

  it("retains a pre-existing suspension when a later sanction is overturned", async () => {
    await q`UPDATE wp_users SET banned_until='2030-01-01T00:00:00Z'::timestamptz WHERE id=2`;
    const [post] =
      await q`INSERT INTO wp_posts(id,author_id,body,status) VALUES(5,2,'Fixture','held') RETURNING id`;
    const postId = Number(post.id);
    expect(await resolveCase(person(6), "post", postId, "restrict1", "other")).toBe(true);
    const [d] = await ownDecisions(2);
    expect(await submitAppeal(person(2), Number(d.id), "Check the test fixture.")).toBe(true);
    const [a] = await q`SELECT id FROM wp_safety_appeals WHERE decision_id=${Number(d.id)}`;
    expect(await reviewAppeal(person(7), Number(a.id), true, "The restriction was unwarranted.")).toBe(true);
    const [u] =
      await q`SELECT extract(year from banned_until)::int AS suspension_year FROM wp_users WHERE id=2`;
    expect(u.suspension_year).toBe(2030);
  });
});

describe("timed room protections", () => {
  it("shares one writing turn across posts and replies, blocks links and scopes the pause to that room", async () => {
    const { setRoomProtection, activeRoomProtections, clearExpiredRoomTurns } = await import("./room-safety");
    const { createPost, addComment } = await import("./social");
    const [r] = await q`INSERT INTO wp_rooms(slug,name) VALUES ('fixture-room','Fixture room') RETURNING id`;
    const room = Number(r.id);
    expect(await setRoomProtection(person(2), "fixture-room", true)).toBe(false);
    expect(await setRoomProtection(person(6), "fixture-room", true)).toBe(true);
    expect(await activeRoomProtections()).toHaveLength(1);
    const link = await createPost(person(5), {
      kind: "text",
      roomId: room,
      body: "Review our guide at example.com",
    });
    expect(link).toMatchObject({ ok: false, error: expect.stringContaining("paused links") });
    // Seeded fixture posts use explicit IDs. Place the database identity above them.
    await q`SELECT setval('wp_posts_id_seq',100)`;
    const first = await createPost(person(5), {
      kind: "text",
      roomId: room,
      body: "What did everyone build?",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await addComment(person(5), first.postId, "I tried armor.")).toMatchObject({
      ok: false,
      error: expect.stringContaining("slowmode"),
    });
    expect(await addComment(person(4), first.postId, "Boots first.")).toMatchObject({ ok: true });
    expect(await createPost(person(5), { kind: "text", body: "Elsewhere" })).toMatchObject({ ok: true });
    expect(await setRoomProtection(person(6), "fixture-room", false)).toBe(true);
    expect(await addComment(person(5), first.postId, "The incident ended.")).toMatchObject({ ok: true });
    await setRoomProtection(person(6), "fixture-room", true);
    await q`UPDATE wp_rooms SET raid_until=now()-interval '1 second' WHERE id=${room}`;
    expect(await activeRoomProtections()).toHaveLength(0);
    expect(await addComment(person(5), first.postId, "See example.com")).toMatchObject({ ok: true });
    await clearExpiredRoomTurns();
    expect(
      (await q`SELECT action FROM wp_mod_log WHERE target_kind='room' ORDER BY id`).map((r) => r.action),
    ).toEqual(["raid_start", "raid_end", "raid_start"]);
  });
});

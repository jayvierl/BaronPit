import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import type { User } from "./auth";
import { TERMS_VERSION } from "./account-policy";
import { closeDuoListing, createDuoListing, duoAction } from "./duo";
import { NORMAL_QUEUE, sessionOptions } from "./duo-session";
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
  vi.stubEnv("DUO_MATCHING_ENABLED", "true");
  await q`INSERT INTO wp_users(id,email,display_name) SELECT i,'p'||i||'@example.test','Player '||i FROM generate_series(1,8) i`;
  await q`INSERT INTO wp_posts(id,author_id,body,kind,status) VALUES (1,1,'Ordinary statement','text','visible'),(2,1,'Restricted test evidence','text','visible'),(3,2,'Private pending submission','media','held'),(4,1,'Another statement','text','visible')`;
  await q`INSERT INTO wp_users(id,email,display_name,created_at,age_band,terms_version,terms_accepted_at)
    SELECT i,'p'||i||'@example.test','Player '||i,now()-interval '3 days','adult',${TERMS_VERSION},now()
    FROM generate_series(21,41) i`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,rank_div,snapshot)
    SELECT 'case-player-'||i,'na1','Fixture '||i,'TEST','GOLD','III','{"matches":[{"matchId":"NA1_1"}]}'::jsonb
    FROM generate_series(21,41) i`;
  await q`INSERT INTO wp_links(user_id,puuid,verified,is_primary)
    SELECT i,'case-player-'||i,true,true FROM generate_series(21,41) i`;
});
afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});

async function invite(owner: number, sender: number, start = sessionOptions(Date.now())[3]) {
  const queue = NORMAL_QUEUE;
  expect(await createDuoListing(person(owner), { queue, start, roles: ["Support"], blocks: [], voice: false, vibe: "chill", note: "" })).toMatchObject({ ok: true });
  const [listing] = await q`SELECT id FROM wp_lfg WHERE user_id=${owner}`;
  const listingId = Number(listing.id);
  expect(await duoAction(person(sender), listingId, "request", { queue, start, role: "ADC", voice: false, vibe: "chill" })).toMatchObject({ ok: true });
  const [request] = await q`SELECT id FROM wp_duo_requests WHERE listing_id=${listingId} AND sender_id=${sender}`;
  return { listingId, requestId: Number(request.id), start };
}

async function overturn(kind: "lfg" | "duo_request", id: number, author: number) {
  const [decision] = await q`SELECT id FROM wp_safety_decisions WHERE target_kind=${kind} AND target_id=${id} AND revoked_at IS NULL AND action<>'dismiss'`;
  expect(await submitAppeal(person(author), Number(decision.id), "Please reconsider this fixture decision.")).toBe(true);
  const [appeal] = await q`SELECT id FROM wp_safety_appeals WHERE decision_id=${Number(decision.id)}`;
  expect(await reviewAppeal(person(7), Number(appeal.id), true, "The independent review found no violation.")).toBe(true);
}

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
    expect(await resolveCase(person(6), "duo_request", Number(inv.id), "remove", "fraud")).toBe(true);
    await overturn("duo_request", Number(inv.id), 3);
    expect((await q`SELECT status FROM wp_duo_requests WHERE id=${Number(inv.id)}`)[0].status).toBe("declined");
  });
  it("redacts a reported profile and restores its previous display fields after clearance", async () => {
    await q`UPDATE wp_users SET bio='Map timers practice' WHERE id=5`;
    await fileReport(person(1), "user", 5, "harassment", "");
    await fileReport(person(2), "user", 5, "harassment", "");
    await fileReport(person(3), "user", 5, "harassment", "");
    const [held] = await q`SELECT display_name,safety_status FROM wp_users WHERE id=5`;
    expect(held).toMatchObject({ display_name: "Community player", safety_status: "held" });
    expect((await reviewQueue(person(6))).cases.find((entry) => entry.kind === "user" && Number(entry.id) === 5)?.excerpt).toBe("Player 5 Map timers practice");
    expect(await resolveCase(person(6), "user", 5, "dismiss", "harassment")).toBe(true);
    expect((await q`SELECT display_name,bio,safety_status FROM wp_users WHERE id=5`)[0]).toMatchObject({
      display_name: "Player 5",
      bio: "Map timers practice",
      safety_status: "visible",
    });
  });

  it("shows ordinary reviewers a held room's original name and description", async () => {
    const [room] = await q`INSERT INTO wp_rooms(slug,name,description)
      VALUES ('fixture-review-room','Mid review','Discuss lane priorities') RETURNING id`;
    const id = Number(room.id);
    for (const reporter of [1, 2, 3]) await fileReport(person(reporter), "room", id, "other", "");
    expect((await q`SELECT name,description,safety_status FROM wp_rooms WHERE id=${id}`)[0]).toEqual({
      name: "Room under review", description: "", safety_status: "held",
    });
    expect((await reviewQueue(person(6))).cases.find((entry) => entry.kind === "room" && Number(entry.id) === id)?.excerpt)
      .toBe("Mid review Discuss lane priorities");
    expect(await resolveCase(person(6), "room", id, "dismiss", "other")).toBe(true);
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

describe("duo consent during moderation", () => {
  it("preserves the original acceptance and its timestamp after an unwarranted suspension is overturned", async () => {
    const { requestId } = await invite(21, 22);
    expect(await duoAction(person(21), requestId, "accept")).toMatchObject({ ok: true });
    const [original] = await q`SELECT accepted_at FROM wp_duo_requests WHERE id=${requestId}`;
    expect((await fileReport(person(21), "duo_request", requestId, "other", "Check this invitation.")).status).toBe(200);
    expect(await resolveCase(person(6), "duo_request", requestId, "restrict1", "other")).toBe(true);
    await overturn("duo_request", requestId, 22);
    expect((await q`SELECT status,accepted_at FROM wp_duo_requests WHERE id=${requestId}`)[0]).toEqual({ status: "accepted", accepted_at: original.accepted_at });
  });

  it("does not restore an acceptance after either verification or the slot expires", async () => {
    for (const [owner, sender, invalidation] of [[23, 24, "verification"], [25, 26, "expiry"]] as const) {
      const { listingId, requestId } = await invite(owner, sender);
      expect(await duoAction(person(owner), requestId, "accept")).toMatchObject({ ok: true });
      expect((await fileReport(person(owner), "duo_request", requestId, "other", "Check this invitation.")).status).toBe(200);
      expect(await resolveCase(person(6), "duo_request", requestId, "remove", "other")).toBe(true);
      if (invalidation === "verification") await q`DELETE FROM wp_links WHERE user_id=${sender}`;
      else await q`UPDATE wp_lfg SET expires_at=now()-interval '1 second' WHERE id=${listingId}`;
      await overturn("duo_request", requestId, sender);
      expect((await q`SELECT status FROM wp_duo_requests WHERE id=${requestId}`)[0].status).toBe("declined");
    }
  });

  it("releases an approved pending invitation only before its original session starts", async () => {
    const { requestId } = await invite(27, 28);
    expect((await fileReport(person(27), "duo_request", requestId, "other", "Check this invitation.")).status).toBe(200);
    expect(await resolveCase(person(6), "duo_request", requestId, "dismiss", "other")).toBe(true);
    expect((await q`SELECT status FROM wp_duo_requests WHERE id=${requestId}`)[0].status).toBe("pending");
    const late = await invite(40, 41);
    await q`UPDATE wp_lfg SET session_start=now()-interval '1 second' WHERE id=${late.listingId}`;
    expect((await fileReport(person(40), "duo_request", late.requestId, "other", "Check the late invitation.")).status).toBe(200);
    expect(await resolveCase(person(6), "duo_request", late.requestId, "dismiss", "other")).toBe(true);
    expect((await q`SELECT status FROM wp_duo_requests WHERE id=${late.requestId}`)[0].status).toBe("declined");
  });

  it("records a participant's withdrawal during a hold without closing the moderation case", async () => {
    const { requestId } = await invite(29, 30);
    expect((await fileReport(person(29), "duo_request", requestId, "private_information", "Benign queue fixture.")).status).toBe(200);
    expect(await duoAction(person(31), requestId, "decline")).toMatchObject({ ok: false });
    expect(await duoAction(person(30), requestId, "decline")).toMatchObject({ ok: true });
    expect((await q`SELECT status FROM wp_duo_requests WHERE id=${requestId}`)[0].status).toBe("held");
    expect(await resolveCase(person(7), "duo_request", requestId, "dismiss", "other")).toBe("second_review");
    expect(await resolveCase(person(8), "duo_request", requestId, "dismiss", "other")).toBe(true);
    expect((await q`SELECT status FROM wp_duo_requests WHERE id=${requestId}`)[0].status).toBe("declined");
  });

  it("does not reopen a listing the owner closed while it was held", async () => {
    const { listingId } = await invite(32, 33);
    for (const reporter of [34, 35, 36]) {
      expect((await fileReport(person(reporter), "lfg", listingId, "other", "Review the listing fixture.")).status).toBe(200);
    }
    expect((await q`SELECT status FROM wp_lfg WHERE id=${listingId}`)[0].status).toBe("held");
    expect(await closeDuoListing(33, listingId)).toMatchObject({ ok: false });
    expect(await closeDuoListing(32, listingId)).toMatchObject({ ok: true });
    expect(await resolveCase(person(6), "lfg", listingId, "remove", "other")).toBe(true);
    await overturn("lfg", listingId, 32);
    expect((await q`SELECT status FROM wp_lfg WHERE id=${listingId}`)[0].status).toBe("closed");
  });

  it("does not restore an acceptance that conflicts with a newer booking", async () => {
    const original = await invite(37, 38);
    expect(await duoAction(person(37), original.requestId, "accept")).toMatchObject({ ok: true });
    expect((await fileReport(person(37), "duo_request", original.requestId, "other", "Check this invitation.")).status).toBe(200);
    expect(await resolveCase(person(6), "duo_request", original.requestId, "remove", "other")).toBe(true);
    const replacement = await invite(39, 38, original.start);
    expect(await duoAction(person(39), replacement.requestId, "accept")).toMatchObject({ ok: true });
    await overturn("duo_request", original.requestId, 38);
    expect((await q`SELECT status FROM wp_duo_requests WHERE id=${original.requestId}`)[0].status).toBe("declined");
    expect((await q`SELECT status FROM wp_duo_requests WHERE id=${replacement.requestId}`)[0].status).toBe("accepted");
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

describe("staff queue age and pagination", () => {
  it("reaches all mixed cases across tied timestamps even if another reviewer closes a case", async () => {
    const reviewer = person(6);
    const before = (await reviewQueue(reviewer)).summary.find((g) => g.priority === 2);
    const urgentBefore = (await reviewQueue(person(7))).summary.find((g) => g.priority === 0);
    await q`INSERT INTO wp_posts(id,author_id,body,status,created_at)
      SELECT i,1,'Pending contribution','held','2020-01-01T10:00:00.000001Z'::timestamptz
      FROM generate_series(1000,1102) i`;
    await q`INSERT INTO wp_posts(id,author_id,body,status,created_at) VALUES
      (2000,1,'Reported much later','held','2010-01-01Z'),
      (2001,1,'Priority report','visible','2010-01-01Z'),
      (2002,1,'Private evidence','held','2010-01-01Z'),
      (2003,6,'Staff own contribution','held','2010-01-01Z')`;
    await q`INSERT INTO wp_reports(target_kind,target_id,reporter_id,category,reason,created_at) VALUES
      ('post',2000,2,'spam','Standard concern','2020-01-01T10:00:00.000002Z'),
      ('post',2001,2,'hate','Priority concern','2020-01-03Z')`;
    await q`INSERT INTO wp_safety_holds(target_kind,target_id,prior_status) VALUES
      ('post',2000,'visible'),('post',2002,'visible')`;
    await q`INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence,opened_at)
      VALUES(gen_random_uuid(),'post',2002,'threats','Restricted concern','2020-01-04Z')`;

    let page = await reviewQueue(reviewer);
    expect(page.cases[0]).toMatchObject({ kind: "post", id: 2001, priority: 1 });
    expect(page.summary.find(g => g.priority === 0)).toBeUndefined();
    expect(page.summary.find(g => g.priority === 2)).toMatchObject({
      total: (before?.total ?? 0) + 104, pastMarker: (before?.pastMarker ?? 0) + 104,
      oldest: expect.stringContaining("2020-01-01T10:00:00.000001"),
    });
    const seen = [...page.cases];
    // Resolve one of the already-read cases while traversing the remaining live queue.
    expect(await resolveCase(reviewer, "post", 1002, "dismiss", "other")).toBe(true);
    for (let i = 0; i < 10 && page.nextCases; i++) {
      page = await reviewQueue(reviewer, { cases: page.nextCases });
      seen.push(...page.cases);
    }
    expect(page.nextCases).toBeNull();
    expect(seen.filter(r => r.id >= 1000).map(r => r.id)).toEqual([
      2001, ...Array.from({ length: 103 }, (_, i) => 1000 + i), 2000,
    ]);
    const owner = await reviewQueue(person(7));
    expect(owner.cases[0]).toMatchObject({ priority: 0, id: 2002, excerpt: null, note: null, link: null });
    expect(owner.summary.find(g => g.priority === 0)).toMatchObject({
      total: (urgentBefore?.total ?? 0) + 1,
      pastMarker: (urgentBefore?.pastMarker ?? 0) + 1,
    });
  });

  it("pages appeals independently and scopes their counts to independent, authorized reviewers", async () => {
    await q`WITH ds AS (
      INSERT INTO wp_safety_decisions(id,operation,target_kind,target_id,author_id,actor_id,action,rule,restricted)
      SELECT i,gen_random_uuid(),'post',1,1,8,'remove','other',i=3030
      FROM generate_series(3000,3030) i RETURNING id
    ) INSERT INTO wp_safety_appeals(id,decision_id,applicant_id,message,created_at)
      SELECT id,id,1,'Review this decision','2020-01-01T00:00:00.000011Z'::timestamptz FROM ds`;
    const general = await reviewQueue(person(6));
    expect(general.summary.find(g => g.priority === 3)).toMatchObject({ total: 30, pastMarker: 30 });
    expect(general.nextAppeals).toBeTruthy();
    const remainder = await reviewQueue(person(6), { appeals: general.nextAppeals });
    expect([...general.appeals,...remainder.appeals].map(r => r.id)).toEqual(
      Array.from({ length: 30 }, (_, i) => 3000 + i));
    expect(remainder.nextAppeals).toBeNull();
    const owner = await reviewQueue(person(7), { appeals: general.nextAppeals });
    expect(owner.appeals.at(-1)).toMatchObject({ id: 3030, restricted: true, message: null });
    expect((await reviewQueue(person(8))).summary.find(g => g.priority === 3)).toBeUndefined();
    for (const bad of ["2.123.post.1","3.1.appeal.9999999999","3.1.unknown.1","unread",[]]) {
      expect((await reviewQueue(person(6), { appeals: bad })).appeals).toEqual(general.appeals);
    }
  });
});

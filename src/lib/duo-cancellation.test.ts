import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { POST } from "../app/api/lfg/route";
import { TERMS_VERSION } from "./account-policy";
import type { User } from "./auth";
import { q } from "./db";
import { cancelDuoBooking, duoAction, readDuoBoard, setRequeue, thankDuo } from "./duo";
import { privateDuoActivity } from "./duo-activity";
import { checkDuoGame, privateGameChecks } from "./duo-game-check";
import { duoPilotResults } from "./duo-pilot";
import { RANKED_QUEUE, sessionOptions } from "./duo-session";
import { DUO_STUDY_VERSION } from "./duo-study-version";

const auth = vi.hoisted(() => ({ current: null as User | null }));
vi.mock("./auth", async (original) => ({
  ...await original<typeof import("./auth")>(),
  getCurrentUser: async () => auth.current,
}));
vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../test/postgres")).neonForTests,
}));

const player = (id: number): User => ({
  id, email: `cancel-${id}@fixture.invalid`, displayName: "Player",
  avatarHue: 0, createdAt: "2020-01-01", bio: "", bannedUntil: null,
  strikeCount: 0, ageBand: "adult", termsCurrent: true,
});

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/duo-cancellation");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DUO_MATCHING_ENABLED", "true");
  await q`INSERT INTO wp_users (id,email,display_name,age_band,terms_version,terms_accepted_at,created_at)
    SELECT n,'cancel-'||n||'@fixture.invalid','Player','adult',${TERMS_VERSION},now(),now()-interval '2 days'
    FROM generate_series(1,14) n`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,rank_div,snapshot)
    SELECT 'fixture-'||n,'na1','Private' || n,'TAG','GOLD','III','{"matches":[{"matchId":"NA1_1"}]}'
    FROM generate_series(1,14) n`;
  await q`INSERT INTO wp_links (user_id,puuid,verified,is_primary)
    SELECT n,'fixture-'||n,true,true FROM generate_series(1,14) n`;
}, 30_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});

async function listing(owner: number, minutes: number) {
  const now = Date.now();
  const start = minutes > 0 ? sessionOptions(now)[minutes / 15 - 1] : now + minutes * 60_000;
  const [row] = await q`INSERT INTO wp_lfg (user_id,puuid,safe_listing,session_queue,session_start,expires_at,partner_role)
    VALUES (${owner},${`fixture-${owner}`},true,${RANKED_QUEUE},
      ${new Date(start).toISOString()},${new Date(start + 60 * 60_000).toISOString()},'Any')
    RETURNING id`;
  return { id: Number(row.id), start };
}

async function booking(owner: number, sender: number, minutes: number, status = "accepted") {
  const slot = await listing(owner, minutes);
  const [row] = await q`INSERT INTO wp_duo_requests (listing_id,sender_id,sender_puuid,status,created_at,accepted_at,offered_role,offered_vibe)
    VALUES (${slot.id},${sender},${`fixture-${sender}`},${status},now()-interval '2 hours',
      CASE WHEN ${status}='pending' THEN null ELSE now()-interval '90 minutes' END,'ADC','chill')
    RETURNING id`;
  return Number(row.id);
}

async function request(userId: number, slot: Awaited<ReturnType<typeof listing>>) {
  return duoAction(player(userId), slot.id, "request", {
    queue: RANKED_QUEUE, start: slot.start, role: "ADC", vibe: "chill", voice: false,
  });
}

it("lets either participant cancel and releases both reservations once", async () => {
  const id = await booking(1, 2, 45);
  const overlapping = await listing(3, 45);
  expect(await request(1, overlapping)).toMatchObject({ ok: false });
  expect(await request(2, overlapping)).toMatchObject({ ok: false });
  expect(await cancelDuoBooking(3, id)).toMatchObject({ ok: false });
  expect(await privateDuoActivity(3)).toEqual([]);
  expect(await privateDuoActivity(1)).toMatchObject([{ id, state: "accepted", canCancel: true }]);
  expect(await privateDuoActivity(2)).toMatchObject([{ id, state: "accepted", canCancel: true }]);

  expect(await cancelDuoBooking(2, id)).toEqual({ ok: true });
  const [cancelled] = await q`SELECT status,cancelled_at FROM wp_duo_requests WHERE id=${id}`;
  expect(cancelled).toMatchObject({ status: "declined", cancelled_at: expect.anything() });
  expect(await cancelDuoBooking(1, id)).toEqual({ ok: true });
  expect(await q`SELECT status,cancelled_at FROM wp_duo_requests WHERE id=${id}`).toEqual([cancelled]);

  for (const account of [1, 2]) {
    expect(await privateDuoActivity(account)).toMatchObject([{ id, state: "cancelled", listingEnded: true }]);
    expect((await readDuoBoard(account)).requests).toMatchObject([{
      id, status: "cancelled", riotId: null, socialProfileId: null, contactEndsAt: null, cancellationEndsAt: null, requeue: null,
    }]);
    expect(await request(account, overlapping)).toEqual({ ok: true });
  }
});

it("ends mutual contact and retains completed game checks and prior thanks during the booked hour", async () => {
  const id = await booking(4, 5, -40);
  await q`UPDATE wp_duo_requests SET sender_requeue=true,owner_requeue=true,sender_thanked=true WHERE id=${id}`;
  await q`INSERT INTO wp_duo_game_checks(request_id,attempted_at,checked_at,first_game_at,expires_at)
    VALUES (${id},now()-interval '5 minutes',now()-interval '3 minutes',now()-interval '10 minutes',now()+interval '29 days')`;
  await q`UPDATE wp_users SET email='cancellation-'||id||'@study.local' WHERE id IN (4,5)`;
  await q`INSERT INTO wp_duo_pilot_members(user_id,study_version,joined_at)
    VALUES (4,${DUO_STUDY_VERSION},now()-interval '1 day'),(5,${DUO_STUDY_VERSION},now()-interval '1 day')`;
  await q`UPDATE wp_lfg SET status='closed' WHERE id=(SELECT listing_id FROM wp_duo_requests WHERE id=${id})`;
  expect((await readDuoBoard(4)).requests).toMatchObject([{ id, requeue: "mutual", riotId: "Private5#TAG" }]);
  expect(await duoPilotResults()).toMatchObject({ accepted: 1, played: 1, mutual: 1 });
  expect(await cancelDuoBooking(4, id)).toEqual({ ok: true });
  const [row] = await q`SELECT sender_requeue,owner_requeue,sender_thanked FROM wp_duo_requests WHERE id=${id}`;
  expect(row).toEqual({ sender_requeue: false, owner_requeue: false, sender_thanked: true });
  expect(await duoPilotResults()).toMatchObject({ accepted: 1, played: 1, mutual: 0 });
  for (const account of [4, 5]) {
    expect((await readDuoBoard(account)).requests).toMatchObject([{
      id, riotId: null, socialProfileId: null, requeue: null, thanks: { sent: account === 5, received: account === 4, canSend: false },
    }]);
    expect(await privateGameChecks(account)).toMatchObject([{ requestId: id, cancelled: true, firstGameAt: expect.any(String) }]);
    expect(await checkDuoGame(account, id)).toMatchObject({ ok: false, status: 404 });
    expect(await setRequeue(account, id, true)).toMatchObject({ ok: false });
    expect(await thankDuo(account, id)).toMatchObject({ ok: false });
  }
  await q`UPDATE wp_lfg SET expires_at=now()-interval '1 minute' WHERE id=(SELECT listing_id FROM wp_duo_requests WHERE id=${id})`;
  expect(await cancelDuoBooking(5, id)).toEqual({ ok: true });
  expect(await privateDuoActivity(5)).toMatchObject([{ id, state: "cancelled", listingEnded: true }]);
});

it("rejects a first cancellation after expiry or before acceptance and keeps held or blocked choices private", async () => {
  const expired = await booking(6, 7, -65);
  const pending = await booking(6, 7, 45, "pending");
  expect(await cancelDuoBooking(7, expired)).toMatchObject({ ok: false });
  expect(await cancelDuoBooking(7, pending)).toMatchObject({ ok: false });
  expect(await q`SELECT id,status,cancelled_at FROM wp_duo_requests WHERE id IN (${expired},${pending}) ORDER BY id`).toEqual([
    { id: expired, status: "accepted", cancelled_at: null },
    { id: pending, status: "pending", cancelled_at: null },
  ]);

  const held = await booking(8, 9, 45, "held");
  await q`INSERT INTO wp_safety_holds(target_kind,target_id,prior_status) VALUES ('duo_request',${held},'accepted')`;
  expect(await cancelDuoBooking(8, held)).toEqual({ ok: true });
  expect(await q`SELECT status FROM wp_duo_requests WHERE id=${held}`).toEqual([{ status: "held" }]);
  expect(await q`SELECT prior_status FROM wp_safety_holds WHERE target_kind='duo_request' AND target_id=${held}`)
    .toEqual([{ prior_status: "declined" }]);
  for (const account of [8, 9]) {
    expect(await privateDuoActivity(account)).toEqual([]);
    expect((await readDuoBoard(account)).requests).toEqual([]);
  }

  const blocked = await booking(10, 11, 45);
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (10,11)`;
  expect(await cancelDuoBooking(11, blocked)).toEqual({ ok: true });
  for (const account of [10, 11]) {
    expect(await privateDuoActivity(account)).toEqual([]);
    expect((await readDuoBoard(account)).requests).toEqual([]);
    expect(await privateGameChecks(account)).toEqual([]);
  }
});

it("requires a same-origin participant and keeps protective cancellation available during a pause", async () => {
  const id = await booking(12, 6, 30);
  const send = (body: object, origin = "https://ward.test") => POST(new Request("https://ward.test/api/lfg", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  const body = { action: "cancel-booking", id };
  expect((await send(body)).status).toBe(401);
  auth.current = player(3);
  expect((await send(body)).status).toBe(400);
  auth.current = { ...player(12), termsCurrent: false, bannedUntil: new Date(Date.now() + 60_000).toISOString() };
  expect((await send(body, "https://elsewhere.test")).status).toBe(403);
  expect((await send({ ...body, contact: "irrelevant" })).status).toBe(400);
  const priorPause = process.env.SAFETY_PAUSE_PUBLICATION;
  vi.stubEnv("DUO_MATCHING_ENABLED", "false");
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "true");
  try {
    const response = await send(body);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(await privateDuoActivity(12)).toEqual([]);
  } finally {
    auth.current = null;
    vi.stubEnv("DUO_MATCHING_ENABLED", "true");
    vi.stubEnv("SAFETY_PAUSE_PUBLICATION", priorPause);
  }
});

it("requires confirmed play for private thanks and does not accept a recipient, amount or payment action", async () => {
  await q`UPDATE wp_users SET age_band='teen' WHERE id IN (13,14)`;
  const id = await booking(13, 14, -65);
  const send = (body: object) => POST(new Request("https://ward.test/api/lfg", {
    method: "POST", headers: { origin: "https://ward.test", "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  auth.current = { ...player(14), ageBand: "teen" };
  try {
    const basic = { action: "thank", id };
    expect((await send(basic)).status).toBe(400);
    await q`INSERT INTO wp_duo_game_checks (request_id,attempted_at,checked_at,first_game_at,expires_at)
      VALUES (${id},now(),now(),now()-interval '30 minutes',now()+interval '29 days')`;
    expect((await readDuoBoard(14)).requests).toMatchObject([{ id, thanks: { canSend: true, adultPair: false } }]);
    expect((await send({ ...basic, amountCents: 500 })).status).toBe(400);
    expect((await send({ ...basic, recipientId: 10 })).status).toBe(400);
    expect((await send({ ...basic, action: "tip" })).status).toBe(400);
    expect((await readDuoBoard(13)).requests).toMatchObject([{ id, thanks: { received: false } }]);
    const response = await send(basic);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await readDuoBoard(13)).requests).toMatchObject([{ id, thanks: { received: true, adultPair: false } }]);
  } finally {
    auth.current = null;
  }
});

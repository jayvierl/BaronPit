import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import type { User } from "./auth";
import { TERMS_VERSION } from "./account-policy";
import { SESSION_QUEUE, sessionOptions } from "./duo-session";
import { privateDuoReadiness } from "./duo-readiness";
import { duoPreferences } from "./duo-input";
import {
  canReportDuo,
  clearExpiredDuoListings,
  closeDuoListing,
  createDuoListing,
  duoAction,
  duoEligible,
  readDuoBoard,
  setRequeue,
  thankDuo,
} from "./duo";
import { endorse, endorsementCounts, setFollow } from "./relationships";
import { createPost, getPost, setBlock } from "./social";
import { POST as uploadToken } from "../app/api/social/upload/route";

vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../test/postgres")).neonForTests,
}));
const user = (id: number): User => ({
  id,
  email: `p${id}@fixtures.invalid`,
  displayName: "P",
  avatarHue: 0,
  createdAt: "2020-01-01",
  bio: "",
  bannedUntil: null,
  strikeCount: 0,
  ageBand: "adult",
  termsCurrent: true,
});
const start = sessionOptions(Date.now())[2];
const offer = { queue: SESSION_QUEUE, start, role: "ADC", vibe: "chill", voice: false };
const prefs = {
  queue: SESSION_QUEUE, start,
  roles: ["Support"],
  partnerRole: "ADC",
  timeZone: "America/Chicago",
  blocks: ["Weekend mornings"],
  voice: false,
  vibe: "chill",
  note: "Practice lane trades",
};
const sample = { games: 10, wins: 6, champPool: [{ champion: "Ashe" }], matches: [{ matchId: "NA1_1" }] };
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/duo");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DUO_MATCHING_ENABLED", "true");
  await q`SELECT 1`;
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    await q`INSERT INTO wp_users (id,email,display_name,created_at,age_band,terms_version,terms_accepted_at)
      VALUES (${id},${user(id).email},${"PRIVATE-SOCIAL-" + id},now()-interval '3 days',${id === 4 ? "teen" : "adult"},${TERMS_VERSION},now())`;
    await q`INSERT INTO wp_players (puuid,platform,game_name,tag_line,rank_tier,rank_div,snapshot) VALUES
      (${"private-puuid-" + id},${id === 5 ? "euw1" : "na1"},${"PRIVATE-RIOT-" + id},'TEST','GOLD','III',${JSON.stringify(sample)}::jsonb)`;
    await q`INSERT INTO wp_links(user_id,puuid,is_primary,verified) VALUES (${id},${"private-puuid-" + id},true,${id !== 3})`;
  }
  await q`UPDATE wp_users SET created_at=now() WHERE id=6`;
}, 30000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});
describe("verified duo and relationship controls", () => {
  it("rejects contact, unsupported preferences and paid-boost solicitation across the API", () => {
    for (const note of [
      "dm @myhandle",
      "try hxx.example.com",
      "my number 555 123 4567",
      "paid duo services",
      "$5 to queue with me",
      "cash app after we win",
      "add me Top#NA1",
      "t.me/duo",
    ])
      expect(duoPreferences({ ...prefs, note }).ok).toBe(false);
    expect(duoPreferences({ ...prefs, roles: ["discord.gg/example"] }).ok).toBe(false);
    expect(duoPreferences({...prefs, timeZone:"Unknown/Zone"}).ok).toBe(false);
    expect(duoPreferences({...prefs, partnerRole:"invented"}).ok).toBe(false);
    expect(duoPreferences(prefs).ok).toBe(true);
  });
  it("binds visibility and consent to verified identity, age, region, current data and reciprocal blocks", async () => {
    expect(await createDuoListing(user(3), prefs)).toMatchObject({ ok: false });
    expect(await duoEligible(6)).toBe(false);
    expect(
      await createDuoListing(user(1), { ...prefs, champs: ["invented"], rank: "CHALLENGER" }),
    ).toMatchObject({ ok: true });
    expect(await createDuoListing(user(1), prefs)).toMatchObject({ ok: false });
    const { listings } = await readDuoBoard(2),
      l = listings[0];
    expect(l).toMatchObject({
      rank: "Gold III",
      roles: ["Support"],
      champs: ["Ashe"],
      own: false,
      form: "6W · 4L in 10 games",
    });
    expect(l.partnerRole).toBe("ADC");
    expect(l.playWindows.length).toBeGreaterThan(0);
    expect(JSON.stringify(listings)).not.toMatch(/PRIVATE-|private-puuid|America\/Chicago/);
    for (const id of [3, 4, 5, 6]) {
      expect((await readDuoBoard(id)).listings).toHaveLength(0);
      expect(await duoAction(user(id), l.id, "request", offer)).toMatchObject({ ok: false });
    }
    expect(await duoAction(user(2), l.id, "request")).toMatchObject({ ok: false });
    expect(await duoAction(user(2), l.id, "request", {...offer, queue:"ranked"})).toMatchObject({ ok: false });
    expect(await duoAction(user(2), l.id, "request", {...offer, role:"Top"})).toMatchObject({ ok: false });
    expect(await duoAction(user(2), l.id, "request", {...offer, start:sessionOptions(Date.now())[3]})).toMatchObject({ ok: false });
    expect(await duoAction(user(2), l.id, "request", offer)).toMatchObject({ ok: true });
    const req = (await readDuoBoard(1)).requests[0];
    expect(req).toMatchObject({ incoming: true, riotId: null, session:{roles:["ADC"],vibe:"chill",voice:false,start} });
    expect(await duoAction(user(2), req.id, "accept")).toMatchObject({ ok: false });
    expect(await duoAction(user(1), req.id, "accept")).toMatchObject({ ok: true });
    expect((await readDuoBoard(2)).requests[0].riotId).toBe("PRIVATE-RIOT-1#TEST");
    expect(await canReportDuo(7, "duo_request", req.id)).toBe(false);
    await setBlock(2, 1, true);
    expect((await readDuoBoard(2)).listings).toHaveLength(0);
    expect((await readDuoBoard(1)).requests).toHaveLength(0);
    expect(await canReportDuo(2, "duo_request", req.id)).toBe(true);
    expect(await setFollow(1, 2, true)).toBe(false);
    await setBlock(2, 1, false);
    expect((await readDuoBoard(2)).requests).toHaveLength(0);
    expect(await closeDuoListing(2, l.id)).toMatchObject({ ok: false });
    expect(await closeDuoListing(1, l.id)).toMatchObject({ ok: true });
  });
  it("honors the session deadline, region and one accepted partner per overlapping session", async () => {
    expect(await privateDuoReadiness(5)).toMatchObject({ ready:false, regionOutsidePilot:true });
    expect(await createDuoListing(user(5),prefs)).toMatchObject({ok:false});
    expect(await createDuoListing(user(7),{...prefs,start:start + 24*3_600_000})).toMatchObject({ok:false});
    expect(await createDuoListing(user(7),prefs)).toMatchObject({ok:true});
    const listing=(await readDuoBoard(2)).listings.find(l=>l.start===start)!;
    expect(await duoAction(user(1),listing.id,"request",offer)).toMatchObject({ok:true});
    expect(await duoAction(user(2),listing.id,"request",offer)).toMatchObject({ok:true});
    const incoming=(await readDuoBoard(7)).requests;
    await q`UPDATE wp_lfg SET session_start=now()-interval '1 minute' WHERE id=${listing.id}`;
    expect(await duoAction(user(7),incoming[0].id,"accept")).toMatchObject({ok:false});
    await q`UPDATE wp_lfg SET session_start=${new Date(start).toISOString()} WHERE id=${listing.id}`;
    expect(await duoAction(user(7),incoming[0].id,"accept")).toMatchObject({ok:true});
    expect(await duoAction(user(7),incoming[1].id,"accept")).toMatchObject({ok:false});
    expect((await readDuoBoard(9)).listings.some(l=>l.id===listing.id)).toBe(false);
    await closeDuoListing(7,listing.id);
  });
  it("lets verified partners opt into another session independently after playing on the same team", async () => {
    await createDuoListing(user(8), prefs);
    const listing = (await readDuoBoard(8)).listings.find((l) => l.own)!;
    await duoAction(user(9), listing.id, "request", offer);
    const request = (await readDuoBoard(8)).requests[0];
    await duoAction(user(8), request.id, "accept");
    expect(await setRequeue(9, request.id, true)).toMatchObject({ ok: false });
    expect(await thankDuo(9, request.id)).toMatchObject({ ok: false });
    await q`UPDATE wp_duo_requests SET accepted_at=now()-interval '6 hours' WHERE id=${request.id}`;
    await q`UPDATE wp_lfg SET expires_at=now()-interval '2 hours' WHERE id=${listing.id}`;
    const game = {
      matchId: "NA1_500",
      startedAt: Date.now() - 120_000,
      playedAt: Date.now() - 60_000,
      teammates: [] as { name: string; tag: string }[],
    };
    async function setSnapshot(id: number, match: typeof game) {
      await q`UPDATE wp_players SET snapshot=${JSON.stringify({ ...sample, matches: [match] })}::jsonb WHERE puuid=${"private-puuid-" + id}`;
    }
    await setSnapshot(8, game);
    await setSnapshot(9, game);
    expect(await thankDuo(9, request.id)).toMatchObject({ ok: false });
    expect((await readDuoBoard(8)).requests).toEqual([]); // An opposing player in the same game is insufficient.
    await setSnapshot(8, { ...game, teammates: [{ name: "PRIVATE-RIOT-9", tag: "TEST" }] });
    await setSnapshot(9, { ...game, teammates: [{ name: "PRIVATE-RIOT-8", tag: "TEST" }] });
    const peerView = async () => (await readDuoBoard(9)).requests[0];
    expect(await peerView()).toMatchObject({ requeue: "available", riotId: null, thanks: { canSend: true, sent: false, received: false, adultPair: true } });
    expect(await thankDuo(7, request.id)).toMatchObject({ ok: false });
    await q`INSERT INTO wp_reports(reporter_id,target_kind,target_id) VALUES(9,'duo_request',${request.id})`;
    expect(await thankDuo(8, request.id)).toMatchObject({ ok: false });
    await q`UPDATE wp_reports SET status='closed' WHERE reporter_id=9 AND target_kind='duo_request' AND target_id=${request.id}`;
    expect(await Promise.all([thankDuo(9, request.id), thankDuo(9, request.id)])).toEqual([{ ok: true }, { ok: true }]);
    expect(await peerView()).toMatchObject({ thanks: { sent: true, received: false }, riotId: null, requeue: "available" });
    expect((await readDuoBoard(8)).requests[0]).toMatchObject({ thanks: { sent: false, received: true }, riotId: null });
    expect(await setRequeue(8, request.id, true)).toMatchObject({ ok: true });
    expect(await peerView()).toMatchObject({ requeue: "available", riotId: null });
    expect(await setRequeue(7, request.id, true)).toMatchObject({ ok: false });
    expect(await setRequeue(9, request.id, true)).toMatchObject({ ok: true });
    expect(await peerView()).toMatchObject({ requeue: "mutual", riotId: "PRIVATE-RIOT-8#TEST" });
    await setRequeue(8, request.id, false);
    expect(await peerView()).toMatchObject({ requeue: "waiting", riotId: null });
    await q`UPDATE wp_users SET age_band='teen' WHERE id=9`;
    expect(await peerView()).toBeUndefined();
    expect(await setRequeue(8, request.id, true)).toMatchObject({ ok: false });
    await q`UPDATE wp_users SET age_band='adult' WHERE id=9`;
    await setBlock(9, 8, true);
    expect(await thankDuo(8, request.id)).toMatchObject({ ok: false });
    expect(await peerView()).toBeUndefined();
    expect(await setRequeue(8, request.id, true)).toMatchObject({ ok: false });
  });
  it("omits unverified legacy endorsements and requires a recent qualifying interaction", async () => {
    await q`INSERT INTO wp_endorsements(from_user,to_user,kind) VALUES(2,1,'helpful')`;
    expect(await endorsementCounts(1)).toEqual({});
    expect(await endorse(user(2), 1, "helpful")).toMatchObject({ ok: false });
    const [post] =
      await q`INSERT INTO wp_posts(author_id,kind,body) VALUES(2,'text','Build question') RETURNING id`;
    await q`INSERT INTO wp_comments(post_id,author_id,body) VALUES(${post.id},1,'Try armor in this matchup')`;
    expect(await endorse(user(2), 1, "helpful")).toMatchObject({ ok: true });
    expect(await endorsementCounts(1)).toEqual({ helpful: 1 });
    expect(await endorse(user(2), 1, "helpful")).toMatchObject({ ok: false });
  });
  it("withholds private-upload tokens and requires review on every new provider link", async () => {
    expect((await uploadToken()).status).toBe(503);
    expect(
      await createPost(user(1), {
        kind: "media",
        body: "Nice play",
        data: { mediaType: "video", url: "https://storage.example/video.mp4" },
      }),
    ).toMatchObject({ ok: false });
    const response = await createPost(user(1), {
      kind: "clip",
      body: "Dragon fight",
      submitForReview: true,
      data: { url: "https://youtu.be/abcdefghijk", status: "visible", clip_review_required: true },
    });
    expect(response).toMatchObject({ ok: true, status: "held" });
    if (!response.ok) return;
    const [row] = await q`SELECT data,clip_review_required FROM wp_posts WHERE id=${response.postId}`;
    expect(row.data).toEqual({ url: "https://www.youtube.com/watch?v=abcdefghijk" });
    expect(row.clip_review_required).toBe(true);
    expect(await getPost(response.postId, null)).toBeNull();
  });
  it("sweeps only old unreported new listings and preserves reports and historical rows", async () => {
    const seeded = await q`INSERT INTO wp_lfg(user_id,puuid,safe_listing,status,expires_at)
      VALUES(1,'private-puuid-1',true,'closed',now()-interval '32 days'),(1,'private-puuid-1',true,'closed',now()-interval '32 days'),
        (1,'private-puuid-1',false,'closed',now()-interval '32 days') RETURNING id`;
    const ids = seeded.map((r) => Number(r.id));
    await q`INSERT INTO wp_reports(reporter_id,target_kind,target_id) VALUES(2,'lfg',${ids[1]})`;
    await clearExpiredDuoListings();
    expect((await q`SELECT id FROM wp_lfg WHERE id=ANY(${ids}::int[]) ORDER BY id`).map((r) => r.id)).toEqual(
      ids.slice(1),
    );
  });
  it("does not expose the board during an operator pause or show a stale snapshot", async () => {
    vi.stubEnv("DUO_MATCHING_ENABLED", "false");
    expect(await duoEligible(1)).toBe(false);
    expect(await readDuoBoard(1)).toEqual({ listings: [], requests: [] });
    vi.stubEnv("DUO_MATCHING_ENABLED", "true");
    await q`UPDATE wp_players SET fetched_at=now()-interval '25 hours' WHERE puuid='private-puuid-7'`;
    expect(await duoEligible(7)).toBe(false);
  });
});

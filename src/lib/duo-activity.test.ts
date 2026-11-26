import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres, testQueries } from "../../test/postgres";
import { TERMS_VERSION } from "./account-policy";
import { q } from "./db";
import { duoEligible, readDuoBoard } from "./duo";
import { hasIncomingDuoRequest, privateDuoActivity } from "./duo-activity";
import { duoCalendar, upcomingDuoSession } from "./duo-reminder";
import { privateDuoReadiness } from "./duo-readiness";

vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../test/postgres")).neonForTests,
}));
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://local.invalid/duo-activity");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DUO_MATCHING_ENABLED", "true");
  vi.stubEnv("RIOT_RSO_CLIENT_ID", "");
  await q`INSERT INTO wp_users(email,display_name,age_band,terms_version,terms_accepted_at,created_at)
    SELECT 'activity-'||i||'@fixture.invalid','Player','adult',${TERMS_VERSION},now(),now()-interval '2 days'
    FROM generate_series(1,4) i`;
}, 30_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});

it("explains private requirements without changing eligibility or claiming an unverified account", async () => {
  expect(await privateDuoReadiness(1)).toMatchObject({ ready: false, action: "Add my Riot ID" });
  await q`UPDATE wp_users SET terms_accepted_at=NULL WHERE id=1`;
  expect(await privateDuoReadiness(1)).toMatchObject({ ready: false, href: "/signin?next=%2Flfg&enrol=1" });
  await q`UPDATE wp_users SET terms_accepted_at=now(),created_at=now() WHERE id=1`;
  expect(await privateDuoReadiness(1)).toMatchObject({ ready: false, availableAt: expect.any(String) });
  await q`UPDATE wp_users SET created_at=now()-interval '2 days' WHERE id=1`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line) VALUES ('test-one','na1','Example','NA1')`;
  await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES (1,'test-one',false)`;
  expect(await privateDuoReadiness(1)).toMatchObject({ title: "Riot verification is awaiting activation" });
  vi.stubEnv("RIOT_RSO_CLIENT_ID", "test-client");
  vi.stubEnv("RIOT_RSO_CLIENT_SECRET", "fixture");
  vi.stubEnv("RIOT_RSO_REDIRECT_URI", "https://local.invalid/api/account/riot/callback");
  expect(await privateDuoReadiness(1)).toMatchObject({ action: "Verify my Riot account" });
  await q`UPDATE wp_links SET verified=true WHERE user_id=1`;
  await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES (4,'test-one',true)`;
  expect(await privateDuoReadiness(1)).toMatchObject({
    title: "Your verified link needs review",
    href: "/safety",
  });
  await q`DELETE FROM wp_links WHERE user_id=4`;
  await q`UPDATE wp_players SET fetched_at=now()-interval '25 hours' WHERE puuid='test-one'`;
  expect(await privateDuoReadiness(1)).toMatchObject({
    action: "Open my player stats",
    href: "/player?platform=na1&riotId=Example%23NA1",
  });
  await q`UPDATE wp_players SET fetched_at=now() WHERE puuid='test-one'`;
  expect(await privateDuoReadiness(1)).toMatchObject({ action: "View my ranked profile" });
  await q`UPDATE wp_players SET rank_tier='GOLD' WHERE puuid='test-one'`;
  expect(await privateDuoReadiness(1)).toMatchObject({ action: "View my recent form" });
  await q`UPDATE wp_players SET snapshot='{"matches":[{"matchId":"NA1_1"}]}' WHERE puuid='test-one'`;
  expect(await privateDuoReadiness(1)).toMatchObject({ ready: true, riotId: "Example#NA1" });
  expect(await duoEligible(1)).toBe(true);
  await q`UPDATE wp_users SET safety_status='held' WHERE id=1`;
  expect(await privateDuoReadiness(1)).toMatchObject({ href: "/me/safety" });
  expect(await duoEligible(1)).toBe(false);
});

it("shows only participants' current invitations and expiry, and immediately honors blocks, pause and age bands", async () => {
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,snapshot)
    SELECT 'safe-'||i,'na1','Sensitive '||i,'HIDDEN','GOLD','{"matches":[{"matchId":"NA1_a"}]}' FROM generate_series(2,4) i`;
  await q`INSERT INTO wp_links(user_id,puuid,verified) SELECT i,'safe-'||i,true FROM generate_series(2,4) i`;
  const [listing] =
    await q`INSERT INTO wp_lfg(user_id,puuid,safe_listing) VALUES (2,'safe-2',true) RETURNING id`;
  const [invite] =
    await q`INSERT INTO wp_duo_requests(listing_id,sender_id,sender_puuid) VALUES (${listing.id},3,'safe-3') RETURNING id`;
  expect(await hasIncomingDuoRequest(2)).toBe(true);
  expect(await hasIncomingDuoRequest(3)).toBe(false);
  expect(await privateDuoActivity(2)).toEqual([
    { id: invite.id, incoming: true, state: "pending", listingEnded: false, expiresAt: expect.any(String) },
  ]);
  expect(await privateDuoActivity(4)).toEqual([]);
  await q`UPDATE wp_lfg SET expires_at=now()-interval '1 minute' WHERE id=${listing.id}`;
  expect(await privateDuoActivity(2)).toMatchObject([{ state: "expired", listingEnded: true }]);
  expect(await hasIncomingDuoRequest(2)).toBe(false);
  await q`UPDATE wp_lfg SET expires_at=now()+interval '4 hours' WHERE id=${listing.id}`;
  await q`UPDATE wp_duo_requests SET status='accepted',accepted_at=now() WHERE id=${invite.id}`;
  expect(await privateDuoActivity(3)).toMatchObject([{ incoming: false, state: "accepted" }]);
  expect(await hasIncomingDuoRequest(2)).toBe(false);
  const booking = Number(invite.id);
  expect(await upcomingDuoSession(3, booking)).toBeNull();
  await q`UPDATE wp_lfg SET session_start=now()+interval '30 minutes',session_queue='normal-draft' WHERE id=${listing.id}`;
  const start = await upcomingDuoSession(3, booking);
  expect(start).toBeInstanceOf(Date);
  expect(await upcomingDuoSession(2, booking)).toEqual(start);
  expect(await upcomingDuoSession(4, booking)).toBeNull();
  expect(await privateDuoActivity(3)).toMatchObject([{reminderStart:start!.toISOString()}]);
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(3,2)`;
  expect(await upcomingDuoSession(2, booking)).toBeNull();
  await q`DELETE FROM wp_blocks WHERE blocker_id=3`;
  await q`UPDATE wp_duo_requests SET status='declined',cancelled_at=now() WHERE id=${booking}`;
  expect(await upcomingDuoSession(3, booking)).toBeNull();
  await q`UPDATE wp_duo_requests SET status='accepted',cancelled_at=NULL WHERE id=${booking}`;
  await q`UPDATE wp_lfg SET expires_at=now()-interval '1 minute' WHERE id=${listing.id}`;
  expect(await privateDuoActivity(2)).toEqual([
    { id: invite.id, incoming: true, state: "accepted", listingEnded: true, expiresAt: expect.any(String) },
  ]);
  expect((await readDuoBoard(2)).requests).toEqual([]);
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(3,2)`;
  expect(await privateDuoActivity(2)).toEqual([]);
  await q`DELETE FROM wp_blocks WHERE blocker_id=3`;
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES(2,3)`;
  expect(await privateDuoActivity(3)).toEqual([]);
  await q`DELETE FROM wp_mutes WHERE muter_id=2`;
  await q`UPDATE wp_users SET age_band='teen' WHERE id=3`;
  expect(await privateDuoActivity(2)).toEqual([]);
  await q`UPDATE wp_users SET age_band='adult' WHERE id=3`;
  await q`UPDATE wp_lfg SET expires_at=now()-interval '25 hours' WHERE id=${listing.id}`;
  expect(await privateDuoActivity(2)).toEqual([]);
  vi.stubEnv("DUO_MATCHING_ENABLED", "false");
  const reads = testQueries.length;
  expect(await privateDuoActivity(2)).toEqual([]);
  expect(await hasIncomingDuoRequest(2)).toBe(false);
  expect(testQueries).toHaveLength(reads);
});

it("exports a private one-hour event with an advance or start-time alarm", () => {
  const start = new Date("2026-11-26T23:45:00Z");
  const earlier = duoCalendar(9, start, new Date("2026-11-26T23:20:00Z"), "https://baronpit.com");
  expect(earlier).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT10M");
  expect(earlier).toContain("DTEND:20261127T004500Z");
  expect(earlier).toContain("CLASS:PRIVATE");
  expect(earlier).toContain("URL:https://baronpit.com/activity?tab=duos");
  const later = duoCalendar(9, start, new Date("2026-11-26T23:44:00Z"), null);
  expect(later).toContain("TRIGGER:PT0M");
  expect(later).not.toContain("URL:");
  expect(earlier.match(/^UID:.+$/m)?.[0]).toBe(later.match(/^UID:.+$/m)?.[0]);
});

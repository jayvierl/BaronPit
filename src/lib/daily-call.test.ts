import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { POST as vote } from "../app/api/social/vote/route";
import { postgres } from "../../test/postgres";
import { TERMS_VERSION } from "./account-policy";
import { dailyCallsForHome, dailyCallWindow, runDailyCall } from "./daily-call";
import { dailyCallScenarios } from "./daily-call-scenarios";
import { q } from "./db";
import { PATCH_PUBLISHER } from "./patch-notes";
import { getPost } from "./social";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
const session = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: session.token }) }) }));

const tokens = ["a".repeat(64), "b".repeat(64)];
const day = 24 * 60 * 60 * 1000;
const now = new Date();

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/daily-call");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false");
  for (const [index, token] of tokens.entries()) {
    const id = 701 + index;
    await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at)
      VALUES(${id},${`${id}@example.test`},'Fixture','adult',${TERMS_VERSION},now())`;
    await q`INSERT INTO wp_sessions(user_id,token_hash,expires_at)
      VALUES(${id},${createHash("sha256").update(token).digest("hex")},now()+interval '1 day')`;
  }
}, 30_000);

beforeEach(async () => {
  await q`TRUNCATE wp_daily_calls`;
  await q`DELETE FROM wp_posts WHERE author_id=(SELECT id FROM wp_users WHERE email=${PATCH_PUBLISHER})`;
  await q`DELETE FROM wp_meta WHERE key LIKE 'daily_call:%'`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});

async function sendVote(postId: number, optionIdx: number, token = tokens[0]) {
  session.token = token;
  return vote(new Request("https://app.test/api/social/vote", { method: "POST",
    headers: { origin: "https://app.test", "Content-Type": "application/json" },
    body: JSON.stringify({ postId, optionIdx }),
  }));
}

it("rotates thirty distinct hypothetical ballots from the start of the scheduled UTC hour", () => {
  const reset = Date.parse("2026-11-26T13:00:00.000Z");
  expect(dailyCallWindow(new Date(reset - 1))).toMatchObject({ day: "2026-11-25", closesAt: new Date(reset).toISOString() });
  expect(dailyCallWindow(new Date(reset))).toMatchObject({ day: "2026-11-26", opensAt: new Date(reset).toISOString() });
  expect(dailyCallWindow(new Date(reset + 59 * 60_000)).day).toBe("2026-11-26");
  expect(new Set(Array.from({length: 30}, (_, i) => dailyCallWindow(new Date(reset + i * day)).scenario.title)).size).toBe(30);
  expect(dailyCallScenarios).toHaveLength(30);
  expect(dailyCallScenarios.every(s => s.body.startsWith("Imagine") && new Set(s.options).size === 4 && s.options.every(o => o.length <= 60))).toBe(true);
});

it("posts only once under concurrent delivery, changes open votes, atomically rolls back failure, then freezes and pays off a tie", async () => {
  const window = dailyCallWindow(now);
  expect(await dailyCallsForHome(null)).toEqual({ entries: [], awaitingFirst: true });
  const deliveries = await Promise.all([runDailyCall(now), runDailyCall(now), runDailyCall(now)]);
  expect(deliveries.map(delivery => delivery.opened).sort()).toEqual([0, 0, 1]);
  const [ballot] = await q`SELECT post_id FROM wp_daily_calls WHERE day=${window.day}::date`;
  const original = Number(ballot.post_id);
  expect(await dailyCallsForHome(null)).toEqual({ entries: [{ id: original, title: window.scenario.title, kind: "poll" }], awaitingFirst: false });
  expect(await getPost(original, null)).toMatchObject({ roomSlug: "general", dailyCall: { closed: false }, pollResults: [0,0,0,0] });
  expect((await sendVote(original, 0, "")).status).toBe(401);
  expect((await sendVote(original, 0)).status).toBe(200);
  expect((await sendVote(original, 0, tokens[1])).status).toBe(200);
  expect((await sendVote(original, 1, tokens[1])).status).toBe(200);

  const next = new Date(window.closesAt);
  const nextDay = dailyCallWindow(next).day;
  await q`ALTER TABLE wp_posts ADD CONSTRAINT fixture_daily_payoff_failure CHECK (NOT (data ? 'dailyCallPayoff')) NOT VALID`;
  await expect(runDailyCall(next)).rejects.toThrow();
  expect(await q`SELECT tally,payoff_post_id FROM wp_daily_calls WHERE day=${window.day}::date`).toEqual([{ tally: null, payoff_post_id: null }]);
  expect(await q`SELECT key FROM wp_meta WHERE key=${`daily_call:${nextDay}`}`).toEqual([]);
  await q`ALTER TABLE wp_posts DROP CONSTRAINT fixture_daily_payoff_failure`;

  expect(await runDailyCall(next)).toEqual({ day: nextDay, closed: 1, payoffs: 1, opened: 1 });
  expect(await runDailyCall(next)).toEqual({ day: nextDay, closed: 0, payoffs: 0, opened: 0 });
  expect((await runDailyCall(new Date(now.getTime()-day))).opened).toBe(0);
  const [closed] = await q`SELECT tally,payoff_post_id FROM wp_daily_calls WHERE day=${window.day}::date`;
  const payoffId = Number(closed.payoff_post_id);
  expect(closed.tally).toEqual([1,1,0,0]);
  expect(await getPost(payoffId, null)).toMatchObject({ dailyCallPayoffFor: original,
    body: expect.stringContaining(`${window.scenario.options[0]} / ${window.scenario.options[1]} tied at 50.0% each (2 votes in total). These are community votes on a hypothetical scenario.`),
  });
  const rejected = await sendVote(original, 2);
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toMatchObject({ error: "Daily Call voting has closed." });
  await q`UPDATE wp_poll_votes SET option_idx=2 WHERE post_id=${original}`;
  expect(await q`SELECT option_idx FROM wp_poll_votes WHERE post_id=${original} ORDER BY option_idx`).toEqual([{ option_idx: 0 }, { option_idx: 1 }]);
  await q`DELETE FROM wp_poll_votes WHERE post_id=${original} AND user_id=701`;
  expect(await getPost(original, null)).toMatchObject({ pollResults: [1,1,0,0], dailyCall: { closed: true, finalized: true } });

  await q`UPDATE wp_posts SET status='held' WHERE id=${original}`;
  expect(await getPost(original,null)).toBeNull();
  expect(await getPost(payoffId,null)).toBeNull();
  expect((await dailyCallsForHome(null)).entries.some(row => row.id===payoffId)).toBe(false);
  expect((await sendVote(original,1)).status).toBe(400);
  await q`UPDATE wp_posts SET status='visible' WHERE id=${original}`;
  expect(await getPost(payoffId,null)).not.toBeNull();
  await q`DELETE FROM wp_posts WHERE id=${payoffId}`;
  expect((await runDailyCall(next)).payoffs).toBe(0);
});

it("rejects votes at cutoff even before a delayed cron and later posts an honest zero-vote result without backfilling missed polls", async () => {
  const past = new Date(now.getTime() - 4 * day);
  const first = dailyCallWindow(past);
  expect((await runDailyCall(past)).opened).toBe(1);
  const [pastRow] = await q`SELECT post_id FROM wp_daily_calls WHERE day=${first.day}::date`;
  const pastId = Number(pastRow.post_id);
  expect(await getPost(pastId, null)).toMatchObject({ dailyCall:{closed:true,finalized:false} });
  expect((await sendVote(pastId,0)).status).toBe(409);
  const resumed = new Date(past.getTime() + 2 * day);
  const missed = dailyCallWindow(new Date(past.getTime() + day));
  expect(await runDailyCall(resumed)).toMatchObject({ opened:1,closed:1,payoffs:1 });
  expect(await q`SELECT day FROM wp_daily_calls WHERE day=${missed.day}::date`).toEqual([]);
  const [settled] = await q`SELECT payoff_post_id FROM wp_daily_calls WHERE day=${first.day}::date`;
  expect(await getPost(Number(settled.payoff_post_id),null)).toMatchObject({ body: expect.stringContaining("No one voted in this round.") });
});

it("publishes a real winning share once the room and scheduled publication are available", async () => {
  const window = dailyCallWindow(now);
  await runDailyCall(now);
  const [ballot] = await q`SELECT post_id FROM wp_daily_calls WHERE day=${window.day}::date`;
  expect((await sendVote(Number(ballot.post_id),3)).status).toBe(200);
  const next = new Date(window.closesAt);
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "true");
  try {
    expect(await runDailyCall(next)).toMatchObject({ opened:0,closed:1,payoffs:0 });
  } finally { vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false"); }
  await q`UPDATE wp_rooms SET safety_status='held' WHERE slug='general'`;
  expect(await runDailyCall(next)).toMatchObject({ opened:0,closed:0,payoffs:0 });
  await q`UPDATE wp_rooms SET safety_status='visible' WHERE slug='general'`;
  expect(await runDailyCall(next)).toMatchObject({ opened:1,closed:0,payoffs:1 });
  const [settled] = await q`SELECT payoff_post_id FROM wp_daily_calls WHERE day=${window.day}::date`;
  expect(await getPost(Number(settled.payoff_post_id),null)).toMatchObject({
    body: expect.stringContaining(`${window.scenario.options[3]} led with 100.0% (1 of 1 vote).`),
  });
});

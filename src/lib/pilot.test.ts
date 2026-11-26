import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import {
  clearExpiredPilotData,
  joinPilot,
  leavePilot,
  pilotDashboard,
  pilotState,
  recordInterest,
  recordPilotVisit,
  saveReview,
  validInterest,
  validReview,
} from "./pilot";
import type { User } from "./auth";

vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../test/postgres")).neonForTests,
}));
const user = (id: number) => ({ id, email: `fixture${id}@example.invalid` }) as User;
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/pilot");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("PILOT_HOST_EMAILS", user(2).email);
  await q`SELECT 1`;
  for (const id of [1, 2, 3, 4, 5, 6]) {
    await q`INSERT INTO wp_users(id,email,display_name) VALUES(${id},${user(id).email},'private fixture')`;
  }
}, 30000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});

it("renders the empty state without manufacturing a sample", async () => {
  const d = await pilotDashboard();
  expect(d.scores[0]).toMatchObject({
    cohort: "all",
    people: 0,
    judged: 0,
    medianHours: null,
    returns: 0,
    mature: 0,
  });
  expect(d.reviews).toEqual([]);
});
it("checks recent NA eligibility on the server and keeps host recruitment separate", async () => {
  expect(await joinPilot(user(1), "club", "UTILITY")).toBe(false);
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,snapshot) VALUES('player','na1','ignored','NA1','GOLD','{"roles":{"UTILITY":3}}')`;
  await q`INSERT INTO wp_links(user_id,puuid,is_primary,verified) VALUES(1,'player',true,false)`;
  expect(await joinPilot(user(1), "club", "BOTTOM")).toBe(false);
  expect(await joinPilot(user(1), "club", "UTILITY")).toBe(true);
  expect(await joinPilot(user(1), "community", "UTILITY")).toBe(true);
  expect((await pilotState(1)).member?.channel).toBe("club");
  expect(await joinPilot(user(2), "community", null)).toBe(true);
  await recordPilotVisit(3, "answer");
  await recordPilotVisit(1, "stats");
  await recordPilotVisit(1, "social");
  await recordPilotVisit(1, "stats");
  expect(await q`SELECT user_id,day_no,stats,social,answer FROM wp_pilot_days`).toEqual([
    { user_id: 1, day_no: 0, stats: true, social: true, answer: false },
  ]);
});
it("separates independent, hosted, immature, stats-only and actual week-four exchange", async () => {
  await q`UPDATE wp_pilot_members SET joined_at=now()-interval '30 days'`;
  await q`INSERT INTO wp_pilot_members(user_id,kind,channel,role,joined_at) VALUES(4,'participant','community','BOTTOM',now()-interval '30 days'),(5,'participant','community','UTILITY',now())`;
  for (const [p, author] of [
    [100, 2],
    [101, 3],
  ]) {
    await q`INSERT INTO wp_posts(id,author_id,body,created_at) VALUES(${p},1,'question',now()-interval '28 days')`;
    await q`INSERT INTO wp_comments(id,post_id,author_id,body,created_at) VALUES(${p},${p},${author},'answer',now()-interval '27 days 2 hours')`;
    await q`INSERT INTO wp_decisions(post_id,champion,role,topic,accepted_comment_id,accepted_at) VALUES(${p},'Ashe','Support','build',${p},now()-interval '26 days')`;
  }
  await q`INSERT INTO wp_pilot_days(user_id,day_no,stats,social,answer) VALUES(1,24,true,true,true),(4,26,true,false,false)`;
  await recordPilotVisit(5, "answer", 101);
  await recordPilotVisit(5, "answer", 9999);
  expect(await q`SELECT answer,social FROM wp_pilot_days WHERE user_id=5`).toEqual([
    { answer: true, social: true },
  ]);
  await q`DELETE FROM wp_pilot_days WHERE user_id=5`;
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(3,5)`;
  await recordPilotVisit(5, "answer", 101);
  expect(await q`SELECT 1 FROM wp_pilot_days WHERE user_id=5`).toHaveLength(0);
  const d = await pilotDashboard();
  expect(d.scores[0]).toMatchObject({
    people: 3,
    askers: 1,
    questions: 2,
    judged: 2,
    timely: 1,
    hosted: 1,
    outsider: 1,
    peer: 0,
    firstExchange: 1,
    mature: 2,
    returns: 1,
    readers: 1,
    writers: 0,
    statsOnly: 1,
  });
  expect(JSON.stringify(d)).not.toContain("example.invalid");
  await q`INSERT INTO wp_comments(id,post_id,author_id,body,created_at) VALUES(301,101,4,'I tried it',now()-interval '5 days')`;
  expect((await pilotDashboard()).scores[0]).toMatchObject({
    mature: 2,
    returns: 2,
    readers: 1,
    writers: 1,
    statsOnly: 0,
  });
  await q`UPDATE wp_comments SET status='held' WHERE id=301`;
  expect((await pilotDashboard()).scores[0]).toMatchObject({
    mature: 2,
    returns: 1,
    readers: 1,
    writers: 0,
    statsOnly: 1,
  });
  await q`UPDATE wp_comments SET status='removed' WHERE id=101`;
  expect((await pilotDashboard()).scores[0]).toMatchObject({ timely: 0, firstExchange: 0, hosted: 1 });
});
it("validates weekly input, persists zero correctly and deletes consent-linked records", async () => {
  expect(validInterest({ audience: "club", intent: "trial", budget: "free" })).toBe(true);
  expect(validInterest({ audience: "club", intent: "subscribed", budget: "free" })).toBe(false);
  const r = {
    weekStart: "2025-11-24",
    hostMinutes: 60,
    safetyMinutes: 20,
    costCents: 0,
    interviews: 2,
    sampled: 8,
    useful: 4,
    drill: "pass" as const,
  };
  expect(validReview(r)).toBe(true);
  expect(validReview({ ...r, useful: 10 })).toBe(false);
  expect(validReview({ ...r, weekStart: "2025-11-26" })).toBe(false);
  await saveReview(r);
  await saveReview({ ...r, interviews: 3 });
  expect((await pilotDashboard()).reviews).toHaveLength(1);
  await recordInterest(1, { audience: "club", intent: "trial", budget: "free" });
  await leavePilot(1);
  expect(await pilotState(1)).toEqual({ member: null, interest: null });
  expect(await q`SELECT 1 FROM wp_pilot_days WHERE user_id=1`).toHaveLength(0);
  expect(await q`SELECT 1 FROM wp_posts WHERE author_id=1`).toHaveLength(2);
  await q`UPDATE wp_pilot_members SET joined_at=now()-interval '57 days' WHERE user_id=4`;
  await clearExpiredPilotData();
  expect((await pilotState(4)).member).toBe(null);
});

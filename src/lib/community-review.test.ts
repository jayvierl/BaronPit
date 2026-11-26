import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { GET as calendar } from "@/app/review-hour/calendar/route";
import { confirmReviewHost, featuredMatchup, reviewHosts, withdrawReviewHost } from "./community-review";
import { q } from "./db";
import { reviewHour, featureWeek } from "./review-hour-time";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
const now = new Date("2026-11-26T12:00:00Z");
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/review-hour");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("PILOT_HOST_EMAILS", "helper@example.test,backup@example.test");
  vi.stubEnv("ADMIN_EMAILS", "");
  await q`SELECT 1`;
  await postgres.exec(`INSERT INTO wp_users(id,email,display_name) VALUES
    (101,'asker@example.test','Asker'),(102,'helper@example.test','Helper'),(103,'viewer@example.test','Viewer'),(104,'backup@example.test','Backup');
    INSERT INTO wp_rooms(id,slug,name) VALUES (101,'feature-fixture','Fixture');
    INSERT INTO wp_posts(id,author_id,body,room_id) VALUES
      (111,101,'How do I trade first wave?',101),(112,101,'What about our Leona lane?',101),
      (113,101,'A later question',101),(114,101,'Where do I roam?',101);
    INSERT INTO wp_comments(id,post_id,author_id,body) VALUES
      (121,111,102,'Take the short trade.'),(122,112,102,'Wait for her E.'),(123,113,102,'Hold the wave.'),(124,114,102,'Recall.');
    INSERT INTO wp_decisions(post_id,champion,opponent,role,topic,patch,accepted_comment_id,accepted_at,outcome) VALUES
      (111,'Ashe','Draven','Support','Laning','26.23',121,'2026-11-21','helped'),
      (112,'Ashe','Leona','Support','Laning','26.23',122,'2026-11-24',null),
      (113,'Ashe','Jinx','Support','Laning','26.23',123,'2026-11-25',null),
      (114,'Ashe',null,'Support','Laning','26.23',124,'2026-11-22',null);`);
}, 30000);
afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});

it("keeps a single Saturday instant across daylight changes and handles exact session boundaries", () => {
  expect(reviewHour(new Date("2026-11-28T20:59:59Z"))).toMatchObject({
    start: "2026-11-28T21:00:00.000Z",
    live: false,
  });
  expect(reviewHour(new Date("2026-11-28T21:00:00Z")).live).toBe(true);
  expect(reviewHour(new Date("2026-11-28T21:59:59Z")).live).toBe(true);
  expect(reviewHour(new Date("2026-11-28T22:00:00Z"))).toMatchObject({
    start: "2026-12-05T21:00:00.000Z",
    live: false,
  });
  expect(featureWeek(new Date("2027-01-01T00:00:00Z")).start).toBe("2026-12-28T00:00:00.000Z");
});

it("downloads the displayed one-hour UTC event and expires an old calendar link", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(now);
    const url = "https://example.test/review-hour/calendar?day=";
    const response = calendar(new Request(url + "2026-11-28"));
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    const body = await response.text();
    expect(body).toContain("DTSTART:20261128T210000Z\r\nDTEND:20261128T220000Z");
    expect(calendar(new Request(url + "2026-11-21")).status).toBe(410);
    expect(calendar(new Request(url + "bad")).status).toBe(410);
  } finally {
    vi.useRealTimers();
  }
});

it("keeps a featured matchup steady within the week, with credited answer, patch, and real outcome", async () => {
  expect(await featuredMatchup(null, now)).toMatchObject({
    postId: 111,
    commentId: 121,
    asker: { name: "Asker" },
    helper: { name: "Helper", host: false },
    outcome: "It helped",
    patch: "26.23",
  });
  // Public self-confirmation is separate from the private allowlist.
  await q`INSERT INTO wp_review_hour_hosts(role,starts_at,user_id) VALUES('Bot',${reviewHour(now).start},102)`;
  expect((await featuredMatchup(null, now))?.helper.host).toBe(true);
  await withdrawReviewHost(102, reviewHour(now).start, "Bot");
  expect((await featuredMatchup(null, now))?.helper.host).toBe(false);
  expect(await featuredMatchup(null, new Date("2026-11-29T23:59:59Z"))).toMatchObject({ postId: 111 });
  expect(await featuredMatchup(null, new Date("2026-11-30T00:00:00Z"))).toMatchObject({ postId: 113 });
});

it("falls back to an eligible current-week answer and honors moderation, blocks and mutes at read time", async () => {
  await q`UPDATE wp_comments SET status='held' WHERE id=121`;
  expect(await featuredMatchup(103, now)).toMatchObject({ postId: 112 });
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES(103,102)`;
  expect(await featuredMatchup(103, now)).toBeNull();
  expect(await featuredMatchup(null, now)).not.toBeNull();
  await q`DELETE FROM wp_mutes WHERE muter_id=103`;
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(101,103)`;
  expect(await featuredMatchup(103, now)).toBeNull();
  await q`DELETE FROM wp_blocks WHERE blocker_id=101`;
  await q`UPDATE wp_rooms SET safety_status='held' WHERE id=101`;
  expect(await featuredMatchup(null, now)).toBeNull();
  await q`UPDATE wp_rooms SET safety_status='visible' WHERE id=101`;
  await q`UPDATE wp_users SET safety_status='held' WHERE id=102`;
  expect(await featuredMatchup(null, now)).toBeNull();
  await q`UPDATE wp_users SET safety_status='visible' WHERE id=102`;
});

it("accepts only self-confirmed eligible hosts, ensures one slot per host, and allows safe withdrawal or turnover", async () => {
  const start = "2035-11-24T21:00:00.000Z";
  expect(await confirmReviewHost(101, start, "Support")).toBe(false);
  expect(await confirmReviewHost(102, start, "Support")).toBe(true);
  expect(await confirmReviewHost(102, start, "Support")).toBe(true);
  expect(await confirmReviewHost(104, start, "Support")).toBe(false);
  expect(await confirmReviewHost(102, start, "Bot")).toBe(false);
  await withdrawReviewHost(104, start, "Support");
  expect(await reviewHosts(start, null)).toEqual([{ id: 102, name: "Helper", role: "Support" }]);
  await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(102,103)`;
  expect(await reviewHosts(start, 103)).toEqual([]);
  await q`UPDATE wp_users SET safety_status='held' WHERE id=102`;
  expect(await reviewHosts(start, null)).toEqual([]);
  expect(await confirmReviewHost(104, start, "Support")).toBe(true);
  await withdrawReviewHost(104, start, "Support");
  expect(await reviewHosts(start, null)).toEqual([]);
});

it("counts only a voluntarily enrolled reader and a later different visible thread or newly published question, with withdrawal erasure", async () => {
  const { startFeaturedSample, observeFeaturedStep, featuredResults } = await import("./featured-sample");
  await postgres.exec(`UPDATE wp_decisions SET accepted_comment_id=NULL;
    INSERT INTO wp_users(id,email,display_name) VALUES (140,'sample-reader@example.test','Reader');
    INSERT INTO wp_posts(id,author_id,body,room_id) VALUES
      (141,101,'An eligible matchup question',101),(142,101,'An existing thread',101),(143,101,'A held thread',101);
    UPDATE wp_posts SET status='held' WHERE id=143;
    INSERT INTO wp_comments(id,post_id,author_id,body) VALUES(145,141,104,'A selected answer.');
    INSERT INTO wp_decisions(post_id,champion,opponent,role,topic,patch,accepted_comment_id,accepted_at)
      VALUES(141,'Ashe','Leona','Bot','Laning','26.23',145,now()-interval '10 seconds');`);
  expect(await startFeaturedSample(140, 141)).toBe(false);
  await q`INSERT INTO wp_pilot_members(user_id,kind,channel,role) VALUES(140,'participant','club','BOTTOM')`;
  expect(await startFeaturedSample(140, 142)).toBe(false);
  expect(await observeFeaturedStep(140, 141, 142)).toBe(false);
  expect(await startFeaturedSample(140, 141)).toBe(true);
  expect(await startFeaturedSample(140, 141)).toBe(false);
  expect(await observeFeaturedStep(140, 141, 141)).toBe(false);
  expect(await observeFeaturedStep(140, 141, 143)).toBe(false);
  expect(await featuredResults()).toEqual({ opened: 1, other: 0, asked: 0 });
  expect(await observeFeaturedStep(140, 141, 142)).toBe(true);
  expect(await featuredResults()).toEqual({ opened: 1, other: 1, asked: 0 });
  await postgres.exec(`INSERT INTO wp_posts(id,author_id,body,room_id) VALUES(147,140,'A new question',101);
    INSERT INTO wp_decisions(post_id,champion,opponent,role,topic) VALUES(147,'Jinx','Ashe','Bot','Laning');`);
  expect(await observeFeaturedStep(140, 141, 147)).toBe(true);
  expect(await featuredResults()).toEqual({ opened: 1, other: 1, asked: 1 });
  await q`UPDATE wp_pilot_feature_samples SET opened_at=now()-interval '31 minutes' WHERE user_id=140`;
  expect(await observeFeaturedStep(140, 141, 142)).toBe(false);
  await q`DELETE FROM wp_pilot_members WHERE user_id=140`;
  expect(await featuredResults()).toEqual({ opened: 0, other: 0, asked: 0 });
});

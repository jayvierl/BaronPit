import { describe, expect, it } from "vitest";
import { publishOutcome, raidModeEnabled, scoreContent, type ModResult } from "./moderation";
import { summarize, rotationIndex } from "./pure";

describe("moderation three-band scoring", () => {
  it("publishes ordinary chat", () => {
    expect(scoreContent("gg everyone, that baron call was perfect", {}).action).toBe("publish");
  });
  it("blocks slurs outright", () => {
    expect(scoreContent("you are a faggot", {}).action).toBe("block");
  });
  it("blocks self-harm bait", () => {
    expect(scoreContent("just kill yourself lol", {}).action).toBe("block");
  });
  it("holds link spam from new accounts", () => {
    const r = scoreContent("free rp at https://example.com and https://example.org", { lowTrust: true });
    expect(r.action).not.toBe("publish");
  });
  it("flags off-platform contact handles", () => {
    expect(scoreContent("add me on discord: player123", {}).hasContactHandle).toBe(true);
  });
  it("does not flag normal mentions of Discord as a word", () => {
    expect(scoreContent("we talked about it on discord yesterday", {}).hasContactHandle).toBe(false);
  });
});

describe("publish outcomes by account trust", () => {
  const borderline = "fuck this play, see https://example.com"; // profanity + link
  // Well past every ramp window, so these tests exercise the score bands.
  const ESTABLISHED = "2026-01-01T00:00:00Z";
  it("publishes clean posts from established accounts", () => {
    const clean = scoreContent("gg everyone, that baron call was perfect", {});
    expect(publishOutcome(clean, { lowTrust: true, authorCreatedAt: ESTABLISHED })).toBe("publish");
    expect(publishOutcome(clean, { lowTrust: false, authorCreatedAt: ESTABLISHED })).toBe("publish");
    const cleanNew = scoreContent("first post, hi everyone", { lowTrust: true });
    expect(cleanNew.action).toBe("publish");
    expect(publishOutcome(cleanNew, { lowTrust: true, authorCreatedAt: ESTABLISHED })).toBe("publish");
  });
  it("blocks clear violations from everyone", () => {
    const blocked = scoreContent("you are a faggot", {});
    expect(publishOutcome(blocked, { lowTrust: true })).toBe("block");
    expect(publishOutcome(blocked, { lowTrust: false })).toBe("block");
  });
  it("holds borderline posts from low-trust accounts", () => {
    const r = scoreContent("fuck shit, terrible game", { lowTrust: true });
    expect(r.action).toBe("hold");
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(publishOutcome(r, { lowTrust: true, authorCreatedAt: threeDaysAgo })).toBe("hold");
  });
  it("publishes borderline posts flagged from established accounts", () => {
    const r = scoreContent(borderline, {});
    expect(r.action).toBe("hold");
    expect(publishOutcome(r, { lowTrust: false, authorCreatedAt: ESTABLISHED })).toBe("publish-flagged");
    expect(publishOutcome(r, { lowTrust: true, authorCreatedAt: ESTABLISHED })).toBe("hold");
  });
  it("keeps a screening outage fail-closed for every account", () => {
    const outage: ModResult = {
      score: 30, action: "hold", hits: ["screening-unavailable"], hasContactHandle: false, linkCount: 0,
    };
    expect(publishOutcome(outage, { lowTrust: false })).toBe("hold");
    expect(publishOutcome(outage, { lowTrust: true })).toBe("hold");
  });
});

describe("new-account ramp", () => {
  const NOW = Date.parse("2026-11-27T12:00:00Z");
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  const clean = () => scoreContent("gg everyone, that baron call was perfect", {});
  const withLink = () => scoreContent("check this build https://example.com", {});

  it("holds clean posts from day-one accounts for review", () => {
    const mod = clean();
    expect(mod.action).toBe("publish");
    expect(publishOutcome(mod, { authorCreatedAt: ago(1 * HOUR), now: NOW })).toBe("hold");
    expect(mod.hits).toContain("new-account-day-one");
  });
  it("still blocks clear violations from day-one accounts", () => {
    const blocked = scoreContent("you are a faggot", {});
    expect(publishOutcome(blocked, { authorCreatedAt: ago(1 * HOUR), now: NOW })).toBe("block");
  });
  it("holds link posts from accounts in their first week", () => {
    const mod = withLink();
    expect(mod.action).toBe("hold"); // link + contact-handle score lands in the borderline band
    expect(publishOutcome(mod, { authorCreatedAt: ago(3 * DAY), hasLink: true, now: NOW })).toBe("hold");
    expect(mod.hits).toContain("new-account-link");
  });
  it("falls back to the score's link count when the caller passes none", () => {
    const mod: ModResult = { score: 0, action: "publish", hits: [], hasContactHandle: false, linkCount: 1 };
    expect(publishOutcome(mod, { authorCreatedAt: ago(3 * DAY), now: NOW })).toBe("hold");
    expect(mod.hits).toContain("new-account-link");
  });
  it("lets link-free posts from first-week accounts follow the normal bands", () => {
    expect(publishOutcome(clean(), { authorCreatedAt: ago(3 * DAY), hasLink: false, now: NOW })).toBe("publish");
    const borderline = scoreContent("fuck shit bitch", {});
    expect(borderline.action).toBe("hold");
    expect(publishOutcome(borderline, { authorCreatedAt: ago(3 * DAY), hasLink: false, lowTrust: false, now: NOW })).toBe("publish-flagged");
    expect(publishOutcome(borderline, { authorCreatedAt: ago(3 * DAY), hasLink: false, lowTrust: true, now: NOW })).toBe("hold");
  });
  it("leaves accounts past the windows untouched", () => {
    expect(publishOutcome(clean(), { authorCreatedAt: ago(1 * DAY), now: NOW })).toBe("publish");
    expect(publishOutcome(clean(), { authorCreatedAt: ago(8 * DAY), now: NOW })).toBe("publish");
    expect(publishOutcome(withLink(), { authorCreatedAt: ago(8 * DAY), hasLink: true, now: NOW })).toBe("publish-flagged");
  });
  it("fails closed when the account creation time is unavailable", () => {
    for (const authorCreatedAt of [undefined, null, "not-a-date"]) {
      const mod = clean();
      expect(publishOutcome(mod, { authorCreatedAt, now: NOW })).toBe("hold");
      expect(mod.hits).toContain("new-account-day-one");
    }
  });

  describe("raid mode", () => {
    it("is enabled only by the exact value 'on'", () => {
      expect(raidModeEnabled({ MODERATION_RAID_MODE: "on" })).toBe(true);
      expect(raidModeEnabled({ MODERATION_RAID_MODE: "off" })).toBe(false);
      expect(raidModeEnabled({ MODERATION_RAID_MODE: "true" })).toBe(false);
      expect(raidModeEnabled({ MODERATION_RAID_MODE: "ON" })).toBe(false);
      expect(raidModeEnabled({})).toBe(false);
      expect(raidModeEnabled({ MODERATION_RAID_MODE: undefined })).toBe(false);
    });
    it("extends the hold-everything window to seven days", () => {
      const mod = clean();
      expect(publishOutcome(mod, { authorCreatedAt: ago(2 * DAY), now: NOW, raidMode: true })).toBe("hold");
      expect(mod.hits).toContain("new-account-day-one");
      expect(publishOutcome(clean(), { authorCreatedAt: ago(8 * DAY), now: NOW, raidMode: true })).toBe("publish");
    });
    it("extends the link window to thirty days", () => {
      const mod = withLink();
      expect(publishOutcome(mod, { authorCreatedAt: ago(20 * DAY), hasLink: true, now: NOW, raidMode: true })).toBe("hold");
      expect(mod.hits).toContain("new-account-link");
      expect(publishOutcome(withLink(), { authorCreatedAt: ago(31 * DAY), hasLink: true, now: NOW, raidMode: true })).toBe("publish-flagged");
    });
    it("changes nothing while off", () => {
      expect(publishOutcome(clean(), { authorCreatedAt: ago(2 * DAY), now: NOW, raidMode: false })).toBe("publish");
      expect(publishOutcome(withLink(), { authorCreatedAt: ago(20 * DAY), hasLink: true, now: NOW, raidMode: false })).toBe("publish-flagged");
    });
  });
});

describe("recent-form summarizer", () => {
  it("computes W/L, KDA and champ pool", () => {
    const s = summarize([
      { matchId: "1", champion: "Ashe", win: true, kills: 5, deaths: 2, assists: 10, cs: 200, durationSec: 1800, queueId: 420, role: "BOTTOM", playedAt: 1, items: [] },
      { matchId: "2", champion: "Ashe", win: false, kills: 3, deaths: 4, assists: 6, cs: 180, durationSec: 1700, queueId: 420, role: "BOTTOM", playedAt: 2, items: [] },
    ]);
    expect(s.games).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.kda).toBe(4);
    expect(s.champPool[0]).toMatchObject({ champion: "Ashe", games: 2, wins: 1 });
  });
  it("handles zero games", () => {
    expect(summarize([]).games).toBe(0);
  });
});

describe("daily highlight rotation", () => {
  it("is deterministic for the same day and always in range", () => {
    const pick1 = rotationIndex("puuid-x:2026-11-25", 5);
    const pick2 = rotationIndex("puuid-x:2026-11-25", 5);
    expect(pick1).toBe(pick2);
    expect(pick1).toBeGreaterThanOrEqual(0);
    expect(pick1).toBeLessThan(5);
  });
});

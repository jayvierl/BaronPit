import { describe, expect, it } from "vitest";
import { publishOutcome, scoreContent, type ModResult } from "./moderation";
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
  it("publishes clean posts from new and established accounts alike", () => {
    const clean = scoreContent("gg everyone, that baron call was perfect", {});
    expect(publishOutcome(clean, { lowTrust: true })).toBe("publish");
    expect(publishOutcome(clean, { lowTrust: false })).toBe("publish");
    const cleanNew = scoreContent("first post, hi everyone", { lowTrust: true });
    expect(cleanNew.action).toBe("publish");
    expect(publishOutcome(cleanNew, { lowTrust: true })).toBe("publish");
  });
  it("blocks clear violations from everyone", () => {
    const blocked = scoreContent("you are a faggot", {});
    expect(publishOutcome(blocked, { lowTrust: true })).toBe("block");
    expect(publishOutcome(blocked, { lowTrust: false })).toBe("block");
  });
  it("holds borderline posts from low-trust accounts", () => {
    const r = scoreContent("fuck shit, terrible game", { lowTrust: true });
    expect(r.action).toBe("hold");
    expect(publishOutcome(r, { lowTrust: true })).toBe("hold");
  });
  it("publishes borderline posts flagged from established accounts", () => {
    const r = scoreContent(borderline, {});
    expect(r.action).toBe("hold");
    expect(publishOutcome(r, { lowTrust: false })).toBe("publish-flagged");
    expect(publishOutcome(r, { lowTrust: true })).toBe("hold");
  });
  it("keeps a screening outage fail-closed for every account", () => {
    const outage: ModResult = {
      score: 30, action: "hold", hits: ["screening-unavailable"], hasContactHandle: false, linkCount: 0,
    };
    expect(publishOutcome(outage, { lowTrust: false })).toBe("hold");
    expect(publishOutcome(outage, { lowTrust: true })).toBe("hold");
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

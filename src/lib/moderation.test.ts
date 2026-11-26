import { describe, expect, it } from "vitest";
import { scoreContent } from "./moderation";
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

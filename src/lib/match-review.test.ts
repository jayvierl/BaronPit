import { describe, expect, it } from "vitest";
import { EARLY_SURRENDER_REASON } from "./match-performance";
import { EXAMPLE_REVIEW_MATCH, EXAMPLE_REVIEW_QUESTION, latestRankedMatch, reviewQuestion, reviewStandout } from "./match-review";
import type { MatchSummary } from "./pure";

function game(overrides: Partial<MatchSummary>): MatchSummary {
  return {
    matchId: "NA1_1", champion: "Ashe", win: true, kills: 5, deaths: 2, assists: 7,
    cs: 180, durationSec: 1800, queueId: 420, role: "BOTTOM", playedAt: 1000, items: [],
    ...overrides,
  };
}

describe("reviewStandout", () => {
  it("leads with stored team damage share when the damage fields exist", () => {
    expect(reviewStandout(game({ damageVersion: 1, teamDamageShare: 0.35, killParticipation: 0.8, vision: 20 })))
      .toEqual({ value: "35%", label: "of team champion damage" });
  });

  it("never reads a damage share from a snapshot without the damage marker", () => {
    expect(reviewStandout(game({ teamDamageShare: 0.35, killParticipation: 0.8 })))
      .toEqual({ value: "80%", label: "kill participation" });
  });

  it("falls back to kill participation, then vision", () => {
    expect(reviewStandout(game({ killParticipation: 0.654 }))).toEqual({ value: "65%", label: "kill participation" });
    expect(reviewStandout(game({ vision: 58 }))).toEqual({ value: "58", label: "vision score" });
  });

  it("shows nothing when no standout stat was stored", () => {
    expect(reviewStandout(game({}))).toBeNull();
    expect(reviewStandout(game({ damageVersion: 1, teamDamageShare: 0 }))).toBeNull();
    expect(reviewStandout(game({ killParticipation: 0, vision: 0 }))).toBeNull();
  });
});

describe("reviewQuestion", () => {
  it("names vision only when a vision score was stored", () => {
    expect(reviewQuestion(game({ vision: 12 })).options).toContain("vision");
    expect(reviewQuestion(game({ killParticipation: 0.5 })).options).not.toContain("vision");
    expect(reviewQuestion(game({})).options).not.toContain("vision");
  });

  it("always asks the same open question and never assigns a cause", () => {
    for (const match of [game({ vision: 3 }), game({ killParticipation: 0.4 }), game({})]) {
      const question = reviewQuestion(match);
      expect(question.lead).toBe("What would you review first?");
      expect(question.options).not.toMatch(/because|lost|threw|fault/i);
    }
  });
});

describe("latestRankedMatch", () => {
  it("returns the newest completed ranked game, skipping other queues", () => {
    const ranked = game({ matchId: "NA1_R", queueId: 440 });
    expect(latestRankedMatch([game({ queueId: 450 }), ranked, game({ matchId: "NA1_OLD" })])).toBe(ranked);
  });

  it("skips remakes and early surrenders", () => {
    const completed = game({ matchId: "NA1_DONE" });
    expect(latestRankedMatch([game({ ratingReason: EARLY_SURRENDER_REASON }), completed])).toBe(completed);
  });

  it("returns null when the snapshot holds no completed ranked game", () => {
    expect(latestRankedMatch([game({ queueId: 450 }), game({ queueId: 400 })])).toBeNull();
    expect(latestRankedMatch([])).toBeNull();
  });
});

describe("the homepage example", () => {
  it("carries exactly the concept's verified Annie line", () => {
    expect(EXAMPLE_REVIEW_MATCH).toMatchObject({
      champion: "Annie", role: "MIDDLE", win: false,
      kills: 12, deaths: 8, assists: 2, performanceRating: 6.5,
    });
    expect(reviewStandout(EXAMPLE_REVIEW_MATCH)).toEqual({ value: "35%", label: "of team champion damage" });
    expect(EXAMPLE_REVIEW_QUESTION.options)
      .toBe("Positioning, vision, or how the team fights started?");
  });
});

import { describe, expect, it } from "vitest";
import {
  dailyCallBreakdownState,
  dailyCallVoteNote,
  publishedBreakdownForTitle,
} from "./daily-call-breakdown";

const breakdown = { when: "Split when both groups can clear.", risk: "Getting picked.", changes: "Vision." };

describe("publishedBreakdownForTitle", () => {
  it("returns the published editor breakdown for the scenario that ran", () => {
    expect(publishedBreakdownForTitle("Defending two waves")).toEqual({
      when: expect.stringContaining("Split if both groups can clear safely"),
      risk: "The risk is getting picked before your team can regroup.",
      changes: "Vision between lanes, timing of the waves, and who can clear without walking up.",
    });
  });

  it("returns null for scenarios without a published breakdown and unknown titles", () => {
    expect(publishedBreakdownForTitle("Bot lane’s first recall")).toBeNull();
    expect(publishedBreakdownForTitle("No such call")).toBeNull();
    expect(publishedBreakdownForTitle(null)).toBeNull();
    expect(publishedBreakdownForTitle(undefined)).toBeNull();
  });
});

describe("dailyCallVoteNote", () => {
  it("keeps the open poll's wording and never says 'yet' once closed", () => {
    expect(dailyCallVoteNote(false, 0)).toBe("No votes yet");
    expect(dailyCallVoteNote(true, 0)).toBe("No votes were cast on this call.");
    expect(dailyCallVoteNote(true, 3)).toBeNull();
    expect(dailyCallVoteNote(false, 3)).toBeNull();
  });
});

describe("dailyCallBreakdownState", () => {
  it("never leaks a breakdown while the call is open", () => {
    expect(dailyCallBreakdownState({ closed: false, totalVotes: 0, breakdown })).toBe("open");
    expect(dailyCallBreakdownState({ closed: false, totalVotes: 9, breakdown })).toBe("open");
  });

  it("shows a published breakdown after close, with or without votes", () => {
    expect(dailyCallBreakdownState({ closed: true, totalVotes: 9, breakdown })).toBe("published");
    expect(dailyCallBreakdownState({ closed: true, totalVotes: 0, breakdown })).toBe("published");
  });

  it("distinguishes no breakdown from no votes after close", () => {
    expect(dailyCallBreakdownState({ closed: true, totalVotes: 9, breakdown: null })).toBe("unpublished");
    expect(dailyCallBreakdownState({ closed: true, totalVotes: 0, breakdown: null })).toBe("no-votes");
  });
});

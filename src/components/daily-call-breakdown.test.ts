import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PostCard } from "./post-card";
import type { PostView } from "../lib/post-types";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const options = ["Split the wave-clear and hold both towers", "Group five at the more exposed tower",
  "Show three mid and set up a top flank", "Give the first turret and defend deeper"];
const breakdown = {
  when: "Split if both groups can clear safely and see the enemy rotate.",
  risk: "The risk is getting picked before your team can regroup.",
  changes: "Vision between lanes, timing of the waves, and who can clear without walking up.",
};

function call(dailyCall: PostView["dailyCall"], pollResults: number[] | null) {
  const post = {
    id: 7, authorId: 1, authorName: "Baron Pit", authorHue: 265, authorFlair: null,
    kind: "poll", body: "Defending two waves\nImagine the enemy has Baron buff.",
    roomId: null, roomSlug: null, roomName: null, status: "visible",
    createdAt: "2026-11-26T13:00:00Z", reactions: {}, myReactions: [],
    commentCount: 0, myVote: null, data: { options }, dailyCall, pollResults,
  } as PostView;
  return renderToStaticMarkup(createElement(PostCard, { post, patch: "16.23.1", signedIn: false }));
}

const closesAt = "2026-11-27T13:00:00.000Z";

describe("Daily Call breakdown rendering", () => {
  it("open poll: voting buttons, real count path, and no breakdown leak", () => {
    const html = call({ closesAt, closed: false, finalized: false, breakdown }, [3, 1, 0, 0]);
    expect(html).toMatch(/<button[^>]*class="poll-option"/);
    expect(html).toContain("4 votes");
    expect(html).not.toContain("The breakdown");
    expect(html).not.toContain(breakdown.when);
  });

  it("closed with votes and a published breakdown: breakdown in the thread, count visible", () => {
    const html = call({ closesAt, closed: true, finalized: true, breakdown }, [3, 1, 0, 0]);
    expect(html).not.toMatch(/<button[^>]*class="poll-option"/);
    expect(html).toContain("4 votes");
    expect(html).toContain("The breakdown");
    expect(html).toContain("When two options make sense.");
    expect(html).toContain(breakdown.when);
    expect(html).toContain("What can go wrong.");
    expect(html).toContain(breakdown.risk);
    expect(html).toContain("What changes the call.");
    expect(html).toContain(breakdown.changes);
  });

  it("closed with votes but no breakdown published: says so plainly", () => {
    const html = call({ closesAt, closed: true, finalized: true, breakdown: null }, [2, 0, 0, 0]);
    expect(html).toContain("2 votes");
    expect(html).toContain("The breakdown hasn’t been published yet.");
    expect(html).not.toContain("When two options make sense.");
  });

  it("closed with zero votes: honest no-votes state, no invented consensus", () => {
    const html = call({ closesAt, closed: true, finalized: true, breakdown: null }, [0, 0, 0, 0]);
    expect(html).toContain("No votes were cast on this call.");
    expect(html).not.toMatch(/>\d+%<\/span>/);
    expect(html).not.toContain("The breakdown hasn’t been published yet.");
  });

  it("closed with zero votes still shows a published editorial breakdown", () => {
    const html = call({ closesAt, closed: true, finalized: true, breakdown }, [0, 0, 0, 0]);
    expect(html).toContain("No votes were cast on this call.");
    expect(html).toContain("The breakdown");
    expect(html).not.toMatch(/>\d+%<\/span>/);
  });
});

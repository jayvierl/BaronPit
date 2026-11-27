import { expect, it } from "vitest";
import { matchTags } from "./match-tags";
import { EARLY_SURRENDER_REASON } from "./match-performance";
import type { MatchSummary } from "./pure";

function game(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return { matchId: "NA1_1", champion: "Ashe", win: true, kills: 5, deaths: 3, assists: 5, cs: 210,
    durationSec: 1800, queueId: 420, role: "BOTTOM", playedAt: Date.UTC(2026, 10, 25), items: [], ...overrides };
}

const labels = (match: MatchSummary) => matchTags(match).map(tag => tag.label);

it("fires no tags for an ordinary game or a remake", () => {
  expect(matchTags(game())).toEqual([]);
  expect(matchTags(game({ ratingReason: EARLY_SURRENDER_REASON, deaths: 0, killParticipation: 1 }))).toEqual([]);
});

it("awards Hand of Baron at a 9.0 rating unless the MVP badge already says it", () => {
  expect(labels(game({ performanceRating: 9 }))).toContain("Hand of Baron");
  expect(labels(game({ performanceRating: 8.99 }))).not.toContain("Hand of Baron");
  expect(labels(game({ performanceRating: 9.6, ratingBadge: "MVP" }))).not.toContain("Hand of Baron");
  expect(labels(game({ performanceRating: 9.6, ratingBadge: "Shared MVP" }))).not.toContain("Hand of Baron");
  expect(labels(game({ performanceRating: 9.6, ratingBadge: "Team Ace" }))).toContain("Hand of Baron");
  const [tag] = matchTags(game({ performanceRating: 9.4 }));
  expect(tag.reason).toContain("9.4");
});

it("fires In Every Fight at exactly 70% kill participation, with the real numbers in the reason", () => {
  expect(labels(game({ killParticipation: 0.7, teamKills: 20 }))).toContain("In Every Fight");
  expect(labels(game({ killParticipation: 0.69 }))).not.toContain("In Every Fight");
  const tag = matchTags(game({ killParticipation: 0.82, teamKills: 17 })).find(entry => entry.id === "in-every-fight");
  expect(tag?.reason).toContain("82%");
  expect(tag?.reason).toContain("17 kills");
});

it("fires Servant of Darkness only for sustained vision over a real game length", () => {
  // 58 vision in 30 minutes ≈ 1.93/min.
  expect(labels(game({ vision: 58 }))).toContain("Servant of Darkness");
  // Same vision crammed into a short game still counts per minute, but the
  // 10-minute floor keeps remakes-length games out.
  expect(labels(game({ vision: 58, durationSec: 599 }))).not.toContain("Servant of Darkness");
  // 44 vision in 30 minutes ≈ 1.47/min — under the rate threshold.
  expect(labels(game({ vision: 44 }))).not.toContain("Servant of Darkness");
  // No stored vision, no tag.
  expect(labels(game({ vision: undefined }))).not.toContain("Servant of Darkness");
  const tag = matchTags(game({ vision: 58 })).find(entry => entry.id === "servant-of-darkness");
  expect(tag?.reason).toContain("58 vision");
});

it("fires Untouchable at 0–1 deaths in games of at least 15 minutes", () => {
  expect(labels(game({ deaths: 0 }))).toContain("Untouchable");
  expect(labels(game({ deaths: 1 }))).toContain("Untouchable");
  expect(labels(game({ deaths: 2 }))).not.toContain("Untouchable");
  expect(labels(game({ deaths: 0, durationSec: 899 }))).not.toContain("Untouchable");
  const tag = matchTags(game({ deaths: 0 })).find(entry => entry.id === "untouchable");
  expect(tag?.reason).toContain("Zero deaths");
});

it("fires Stomp only for wins under 22 minutes", () => {
  expect(labels(game({ durationSec: 1319 }))).toContain("Stomp");
  expect(labels(game({ durationSec: 1320 }))).not.toContain("Stomp");
  expect(labels(game({ durationSec: 1200, win: false }))).not.toContain("Stomp");
});

it("gates the damage tag on stored damage data and a 30% team share", () => {
  expect(labels(game({ teamDamageShare: 0.45 }))).not.toContain("Heavy Hitter");
  expect(labels(game({ teamDamageShare: 0.45, damageVersion: 1 }))).toContain("Heavy Hitter");
  expect(labels(game({ teamDamageShare: 0.29, damageVersion: 1 }))).not.toContain("Heavy Hitter");
  const tag = matchTags(game({ teamDamageShare: 0.3, damageVersion: 1 })).find(entry => entry.id === "heavy-hitter");
  expect(tag?.reason).toContain("30%");
});

it("fires Baron Regular at two or more team Barons", () => {
  expect(labels(game({ teamBaronKills: 2 }))).toContain("Baron Regular");
  expect(labels(game({ teamBaronKills: 1 }))).not.toContain("Baron Regular");
  expect(labels(game({ teamBaronKills: undefined }))).not.toContain("Baron Regular");
});

it("fires Rough One Out at 5+ deaths with a KDA under 1, and only then", () => {
  expect(labels(game({ kills: 2, deaths: 6, assists: 3 }))).toContain("Rough One Out");
  expect(labels(game({ kills: 2, deaths: 4, assists: 3 }))).not.toContain("Rough One Out");
  // 5 deaths but a 1.2 KDA is not a rough one.
  expect(labels(game({ kills: 3, deaths: 5, assists: 3 }))).not.toContain("Rough One Out");
  const tag = matchTags(game({ kills: 2, deaths: 6, assists: 3 })).find(entry => entry.id === "rough-one-out");
  expect(tag?.reason).toContain("2/6/3");
});

it("fires Slow Harvest only for farming roles under 5 CS/min in full-length games", () => {
  // 140 CS in 30 minutes ≈ 4.7/min.
  expect(labels(game({ cs: 140 }))).toContain("Slow Harvest");
  expect(labels(game({ cs: 150 }))).not.toContain("Slow Harvest");
  // Support is not a farming role, however quiet the farm.
  expect(labels(game({ cs: 60, role: "UTILITY" }))).not.toContain("Slow Harvest");
  // A 19-minute game is too short to judge.
  expect(labels(game({ cs: 90, durationSec: 1140 }))).not.toContain("Slow Harvest");
});

it("caps at three tags, most significant first", () => {
  const tags = matchTags(game({
    performanceRating: 9.2, killParticipation: 0.9, teamKills: 20, vision: 70,
    deaths: 0, teamDamageShare: 0.4, damageVersion: 1, durationSec: 1200,
  }));
  expect(tags.map(tag => tag.label)).toEqual(["Hand of Baron", "In Every Fight", "Servant of Darkness"]);
});

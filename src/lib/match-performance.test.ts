import { describe, expect, it } from "vitest";
import { matchFromRiot, readStoredMatches } from "./riot-match";
import { rankedMatchFixture as game } from "../../test/ranked-match";

const matchId = "NA1_12345";
type Fixture = ReturnType<typeof game>;
const support = { kills: 0, assists: 8, deaths: 0, visionScore: 100 };
function project(raw: Fixture, slot = 1) {
  return matchFromRiot(raw, matchId, `fixture-${slot}`)!;
}

describe("Baron Match Rating v2", () => {
  it("rewards a strong zero-kill support on either team and preserves the same score in the row and scoreboard", () => {
    for (const slot of [1, 6]) {
      const raw = game();
      Object.assign(raw.info.participants[slot - 1], support);
      const player = project(raw, slot);
      expect(player.performanceRating).toBeGreaterThan(6.5);
      expect(player.performanceRating).toBeLessThan(10);
      expect(player.ratingBadge).toBe(slot === 1 ? "MVP" : "Team Ace");
      expect(player.ratingReason).toContain("opposing role");
      expect(player.teams?.allies.find(p => p.isPlayer)?.performanceRating).toBe(player.performanceRating);
      expect(readStoredMatches([player], 20)[0]).toMatchObject({ performanceRating: player.performanceRating, ratingBadge: player.ratingBadge, teams: player.teams });
    }
  });

  it("shares exact ties, treats equal contributions as 5.5 and is independent of result, queue and input order", () => {
    const raw = game();
    expect(project(raw)).toMatchObject({ performanceRating: 5.5, ratingBadge: "Shared MVP" });
    raw.info.queueId = 440;
    raw.info.participants.reverse();
    expect(project(raw, 6)).toMatchObject({ performanceRating: 5.5, ratingBadge: "Shared Team Ace" });
  });

  it("uses the strongest comparable signal, and omits objective weight for everybody when coverage is incomplete", () => {
    const raw = game();
    raw.info.participants[0].visionScore = 40;
    // At 30 minutes the vision difference is (40-10)/40 = .75.
    // An otherwise even comparison gains 4.5 * 20 * .75 / 100.
    expect(project(raw).performanceRating).toBeCloseTo(6.175);
    expect(project(raw).ratingReason).toContain("vision/min");
    raw.info.participants[9].damageDealtToObjectives = NaN;
    expect(project(raw).performanceRating).toBeCloseTo(5.5 + 4.5 * 20 * .75 / 95);
    // Game length affects the low-evidence floor for vision per minute.
    raw.info.gameDuration = 18000;
    expect(project(raw).performanceRating).toBeLessThan(6);
  });

  it("awards badges before rounding and withholds them for an incomplete side", () => {
    const player = project(game());
    const rows = player.teams!.allies;
    rows[0].performanceRating = 6.521;
    rows[1].performanceRating = 6.519;
    const read = () => readStoredMatches([player], 20)[0];
    expect(read().ratingBadge).toBe("MVP");
    expect(read().teams!.allies[1].ratingBadge).toBeUndefined();
    rows[4].performanceRating = NaN;
    expect(read().ratingBadge).toBeUndefined();
    expect(read().performanceRating).toBeUndefined();
    expect(read().ratingReason).toBeUndefined();
    expect(read().teams!.opponents.every(p => p.performanceRating === undefined && p.ratingBadge === undefined)).toBe(true);
  });

  it.each<[string, (raw: Fixture) => void]>([
    ["short game", g => { g.info.gameDuration = 899; }],
    ["early surrender", g => { g.info.participants[9].gameEndedInEarlySurrender = true; }],
    ["private game", g => { g.info.queueId = 0; }],
    ["normal game", g => { g.info.queueId = 400; }],
    ["different map", g => { g.info.mapId = 12; }],
    ["missing opponent", g => { g.info.participants.pop(); }],
    ["duplicate role", g => { g.info.participants[9].teamPosition = "JUNGLE"; }],
    ["duplicate participant slot", g => { g.info.participants[9].participantId = 1; }],
    ["unusable damage", g => { g.info.participants[9].totalDamageDealtToChampions = NaN; }],
    ["missing team vision", g => { for (const p of g.info.participants.slice(5)) p.visionScore = 0; }],
    ["missing economy", g => { g.info.participants[9].goldEarned = 0; }],
    ["impossible kill participation", g => { g.info.participants[9].assists = 99; }],
    ["conflicting outcomes", g => { g.info.participants[9].win = true; }],
  ])("keeps the match with an explanation and no score for %s", (_, change) => {
    const raw = game();
    change(raw);
    expect(project(raw)).toMatchObject({ matchId, performanceRating: undefined, ratingBadge: undefined, ratingReason: expect.any(String) });
  });

  it("omits legacy scores and ignores stale or forged top-level badges and mismatched top-level scores", () => {
    const match = project(game());
    expect(readStoredMatches([{ ...match, detailsVersion: 2, performanceRating: 10 }], 20)[0].performanceRating).toBeUndefined();
    expect(readStoredMatches([{ ...match, performanceRating: 10, ratingBadge: "MVP" }], 20)[0]).toMatchObject({ performanceRating: 5.5, ratingBadge: "Shared MVP" });
  });
});

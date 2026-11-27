import { describe, expect, it } from "vitest";
import { matchFromRiot, readStoredMatches } from "./riot-match";
import { rankedMatchFixture as game } from "../../test/ranked-match";

const matchId = "NA1_12345";
type Fixture = ReturnType<typeof game>;
const support = { kills: 0, assists: 8, deaths: 0, visionScore: 100 };
function project(raw: Fixture, slot = 1) {
  return matchFromRiot(raw, matchId, `fixture-${slot}`);
}

describe("ranked match performance", () => {
  it("lets a zero-kill support earn MVP through contribution and preserves the rating on cache read", () => {
    const raw = game();
    Object.assign(raw.info.participants[0], support);
    const player = project(raw)!;
    expect(player.performanceRating).toBe(10);
    expect(raw.info.participants.map((_, i) => project(raw, i + 1)?.performanceRating).filter(r => r === 10)).toHaveLength(1);
    expect(readStoredMatches([player], 20)[0].performanceRating).toBe(10);
    expect(JSON.stringify(player)).not.toMatch(/visionScore|participantId|totalDamageDealtToChampions/);
  });

  it("shares tied places and awards no MVP in a tie, regardless of side, outcome or row order", () => {
    const raw = game();
    expect(project(raw)?.performanceRating).toBe(5.5);
    raw.info.queueId = 440;
    Object.assign(raw.info.participants[5], support);
    expect(project(raw, 6)?.performanceRating).toBe(10);
    Object.assign(raw.info.participants[0], support);
    expect(project(raw, 6)?.performanceRating).toBe(9.5);
    raw.info.participants.reverse();
    expect(project(raw)?.performanceRating).toBe(9.5);
  });

  it.each<[string, (raw: Fixture) => void]>([
    ["short game", g => { g.info.gameDuration = 899; }],
    ["early surrender", g => { g.info.participants[9].gameEndedInEarlySurrender = true; }],
    ["private game", g => { g.info.queueId = 0; }],
    ["normal game", g => { g.info.queueId = 400; }],
    ["different map", g => { g.info.mapId = 12; }],
    ["missing opponent", g => { g.info.participants.pop(); }],
    ["duplicate participant slot", g => { g.info.participants[9].participantId = 1; }],
    ["unusable damage", g => { g.info.participants[9].totalDamageDealtToChampions = NaN; }],
    ["missing team vision", g => { for (const p of g.info.participants.slice(5)) p.visionScore = 0; }],
    ["impossible kill participation", g => { g.info.participants[9].assists = 99; }],
    ["conflicting outcomes", g => { g.info.participants[9].win = true; }],
  ])("keeps the match and omits its rating for %s", (_, change) => {
    const raw = game();
    change(raw);
    expect(project(raw)).toMatchObject({ matchId, performanceRating: undefined });
  });

  it("omits ratings on legacy rows or malformed stored evidence", () => {
    const match = project(game())!;
    for (const change of [{ performanceRating: undefined }, { performanceRating: "10" }, { performanceRating: 9.8 },
      { performanceRating: 11 }, { performanceRating: 0 }, { detailsVersion: 1 }, { teams: undefined }, { durationSec: 380 }, { queueId: 450 }]) {
      expect(readStoredMatches([{ ...match, ...change }], 20)[0].performanceRating).toBeUndefined();
    }
  });
});

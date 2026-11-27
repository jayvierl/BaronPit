import { expect, it } from "vitest";
import { matchFromRiot, readStoredMatches } from "./riot-match";

const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const champions = ["Garen", "Vi", "Ahri", "Ashe", "Nami", "Darius", "Warwick", "Katarina", "Jinx", "Lulu"];

function participant(index: number, overrides: Record<string, unknown> = {}) {
  const teamId = index < 5 ? 100 : 200;
  return {
    participantId: index + 1, teamId, teamPosition: roles[index % 5],
    championName: champions[index], puuid: `puuid-${index}`,
    riotIdGameName: `Player${index}`, riotIdTagline: "NA1",
    win: teamId === 100, kills: 5, deaths: 2, assists: 5,
    totalMinionsKilled: 150, neutralMinionsKilled: 10,
    goldEarned: 10000, visionScore: 20, champLevel: 16,
    totalDamageDealtToChampions: 10000, totalDamageTaken: 8000, damageDealtToObjectives: 500,
    gameEndedInEarlySurrender: false,
    summoner1Id: 4, summoner2Id: 12, item0: 1001, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    perks: { styles: [
      { description: "primaryStyle", style: 8000, selections: [{ perk: 8005 }] },
      { description: "subStyle", style: 8400 },
    ] },
    ...overrides,
  };
}

function payload(meDamage: number) {
  const participants = champions.map((_, index) => participant(index,
    index === 3 ? { puuid: "me-puuid", totalDamageDealtToChampions: meDamage } : {}));
  return {
    metadata: { matchId: "NA1_4242" },
    info: {
      mapId: 11, queueId: 420, gameDuration: 1800, gameVersion: "16.23.1",
      gameStartTimestamp: 1764000000000, gameEndTimestamp: 1764001800000,
      teams: [
        { teamId: 100, objectives: { champion: { kills: 25 }, baron: { kills: 1 } } },
        { teamId: 200, objectives: { champion: { kills: 25 }, baron: { kills: 0 } } },
      ],
      participants,
    },
  };
}

it("stores damage, damage taken and team damage share from the same payload", () => {
  const match = matchFromRiot(payload(20000), "NA1_4242", "me-puuid");
  expect(match).not.toBeNull();
  // Allies dealt 20000 + 4 × 10000 = 60000 in total.
  expect(match).toMatchObject({ damage: 20000, damageTaken: 8000, damageVersion: 1 });
  expect(match!.teamDamageShare).toBeCloseTo(1 / 3);
  expect(match!.performanceRating).toBeDefined();
  const me = match!.teams!.allies.find(p => p.isPlayer)!;
  expect(me).toMatchObject({ damage: 20000, damageTaken: 8000 });
  expect(me.damageShare).toBeCloseTo(1 / 3);
  const rival = match!.teams!.opponents[0];
  expect(rival.damage).toBe(10000);
  expect(rival.damageShare).toBeCloseTo(10000 / 50000);
});

it("keeps damage through the stored-match reader only for damage-versioned rows", () => {
  const stored = matchFromRiot(payload(20000), "NA1_4242", "me-puuid")!;
  const roundTripped = readStoredMatches([JSON.parse(JSON.stringify(stored))], 20);
  expect(roundTripped).toHaveLength(1);
  expect(roundTripped[0]).toMatchObject({ damage: 20000, damageTaken: 8000, damageVersion: 1 });
  expect(roundTripped[0].teamDamageShare).toBeCloseTo(1 / 3);
  expect(roundTripped[0].teams!.allies.find(p => p.isPlayer)).toMatchObject({ damage: 20000 });

  const legacy = JSON.parse(JSON.stringify(stored));
  delete legacy.damageVersion;
  const [downgraded] = readStoredMatches([legacy], 20);
  expect(downgraded.damage).toBeUndefined();
  expect(downgraded.teamDamageShare).toBeUndefined();
  expect(downgraded.damageVersion).toBeUndefined();
});

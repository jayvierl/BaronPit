/** Synthetic complete Match-v5 response with ten equally placed participants. */
export function rankedMatchFixture(matchId = "NA1_12345", playerPuuid = "fixture-1") {
  const participants = Array.from({ length: 10 }, (_, i) => ({
    puuid: i === 0 ? playerPuuid : `fixture-${i + 1}`, participantId: i + 1, teamId: i < 5 ? 100 : 200, win: i < 5,
    championName: "Nami", teamPosition: ["UTILITY", "JUNGLE", "MIDDLE", "BOTTOM", "TOP"][i % 5], goldEarned: 9000, damageDealtToObjectives: 5000, kills: 2, deaths: 4, assists: 1,
    visionScore: 10, totalDamageDealtToChampions: 100, totalMinionsKilled: 10, neutralMinionsKilled: 0,
    gameEndedInEarlySurrender: false,
  }));
  return { metadata: { matchId }, info: { participants, queueId: 420, mapId: 11, gameDuration: 1800, gameEndTimestamp: 2_000_000 } };
}

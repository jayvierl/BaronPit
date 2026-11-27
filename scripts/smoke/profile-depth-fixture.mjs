export const depthName = "Synthetic Depth";
export const depthTag = "LAB";
const depthPuuid = "fixture-profile-depth";
const hour = 60 * 60 * 1000;
const day = 24 * hour;
const solo = "RANKED_SOLO_5x5";
const flex = "RANKED_FLEX_SR";

const pattern = [
  ["Nami", "UTILITY", 420], ["Nami", "UTILITY", 420], ["Ashe", "BOTTOM", 420],
  ["Vi", "JUNGLE", 400], ["Ashe", "BOTTOM", 440],
];

export function depthMatchId(index) {
  return `NA1_${910000 + index}`;
}

function depthMatches(now) {
  return Array.from({ length: 100 }, (_, index) => {
    const [champion, role, queueId] = pattern[index % pattern.length];
    const recent = index < 20;
    const playedAt = now - (2 + index * 6) * hour;
    const durationSec = recent ? 1800 : 1920;
    const teammate = { champion: champion === "Ashe" ? "Sivir" : "Ashe", name: "Fixture Archer", tag: "NA1" };
    return {
      matchId: depthMatchId(index), champion, role, queueId,
      win: recent ? index % 4 !== 3 : index % 2 === 0,
      kills: recent ? 6 : 5, deaths: recent ? 2 : 4, assists: recent ? 7 : 5,
      cs: 120, durationSec, playedAt, startedAt: playedAt - durationSec * 1000,
      gamePatch: "16.23", opponentChampion: "Lulu", gold: 10310,
      items: [3158, 3067, 3340], spellIds: [4, 12],
      runes: { keystone: 8005, primaryStyle: 8000, secondaryStyle: 8400 },
      championLevel: 14, teamKills: 20, killParticipation: recent ? 0.65 : 0.5,
      teamBaronKills: index % 2, detailsVersion: 1,
      teammates: [teammate],
      teams: {
        allies: [{ champion, isPlayer: true }, teammate,
          { champion: "Ahri" }, { champion: "Amumu" }, { champion: "Garen" }],
        opponents: ["Lulu", "Jinx", "Katarina", "Warwick", "Darius"].map(champion => ({ champion })),
      },
    };
  });
}

export async function seedPlayerDepth(tx) {
  const now = Date.now();
  const recent = depthMatches(now);
  const snapshot = {
    games: 20, wins: 15, losses: 5, kda: 6.5, mainChamp: "Ashe",
    roles: { UTILITY: 8, BOTTOM: 8, JUNGLE: 4 },
    champPool: [
      { champion: "Ashe", games: 8, wins: 6, kda: 6.5 },
      { champion: "Nami", games: 8, wins: 6, kda: 6.5 },
      { champion: "Vi", games: 4, wins: 3, kda: 6.5 },
    ],
    matches: recent.slice(0, 20),
    olderMatches: recent.slice(20),
    historyComplete: true,
    rankedEntries: [
      { queueType: solo, tier: "GOLD", rank: "II", leaguePoints: 36, wins: 56, losses: 44 },
      { queueType: flex, tier: "SILVER", rank: "III", leaguePoints: 12, wins: 11, losses: 9 },
    ],
    championMastery: {
      fetchedAt: new Date(now - hour).toISOString(),
      champions: [{ championId: 267, level: 18, points: 109842 }, { championId: 22, level: 11, points: 51840 }],
    },
  };
  await tx.query(
    `INSERT INTO wp_players (
      puuid,platform,game_name,tag_line,summoner_level,profile_icon,rank_tier,rank_div,rank_lp,rank_wins,rank_losses,snapshot
    ) VALUES ($1,'na1',$2,$3,205,17,'GOLD','II',36,56,44,$4::jsonb)`,
    [depthPuuid, depthName, depthTag, JSON.stringify(snapshot)],
  );

  // Keep the archived sample in the current UTC year. January 1 has only one recorded day.
  const captured = new Date(now);
  const previous = new Date(now - day);
  const soloRecords = [[captured, 36, 56, 44]];
  if (previous.getUTCFullYear() === captured.getUTCFullYear()) soloRecords.push([previous, 19, 55, 44]);
  for (const [date, lp, wins, losses] of soloRecords) {
    const iso = date.toISOString();
    await tx.query(
      `INSERT INTO wp_rank_history (puuid, platform, queue, observed_day, tier, division, lp, wins, losses, captured_at)
      VALUES ($1,'na1',$2,$3::date,'GOLD','II',$4,$5,$6,$7::timestamptz)`,
      [depthPuuid, solo, iso.slice(0, 10), lp, wins, losses, iso],
    );
  }
}

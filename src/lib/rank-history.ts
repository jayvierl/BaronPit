import { LEAGUE_TIERS, rankLabel, type LeagueTier } from "./rank";
import type { PlatformId } from "./platforms";
import type { RankedEntry } from "./player-summary";

// Riot's 2025 ranked rewards schedule identifies these shard clocks:
// https://support.riotgames.com/en-us/league-of-legends/rewards/league-of-legends-end-of-season-2025-ranked-rewards/
export const RANKED_SERVER_TIME_ZONES: Record<PlatformId, string> = {
  na1: "America/Los_Angeles",
  euw1: "Europe/London",
  eun1: "Europe/Warsaw",
  kr: "Asia/Seoul",
  br1: "America/Sao_Paulo",
  jp1: "Asia/Tokyo",
  la1: "America/Mexico_City",
  la2: "America/Argentina/Buenos_Aires",
  oc1: "Australia/Sydney",
  tr1: "Europe/Istanbul",
  ru: "Europe/Moscow",
};

// One ladder year spans three reward seasons. Bounds are local server times,
// with exclusive endings. Add Riot-confirmed dates here when the next year
// opens. Observations in the uncertain window are still saved and can be
// classified once Riot publishes the ranked schedule.
// https://www.leagueoflegends.com/en-us/news/game-updates/patch-25-s1-1-notes/
// https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/
// https://www.leagueoflegends.com/en-us/news/dev/tldw-season-1-2027-dev-update---lol-website-article-lollol27-s1225r001/
export const RANKED_YEARS = [
  { year: 2025, opens_at: "2025-01-09 12:00:00", closes_at: "2026-01-08 00:00:00", apex_closes_at: "2026-01-07 23:45:00" },
  // The 2027 reset is confirmed for January; the exact time is unpublished.
  { year: 2026, opens_at: "2026-01-08 12:00:00", closes_at: "2027-01-01 00:00:00", apex_closes_at: "2027-01-01 00:00:00" },
] as const;

export const RANK_HISTORY_QUEUES = {
  RANKED_SOLO_5x5: "Ranked Solo/Duo",
  RANKED_FLEX_SR: "Ranked Flex",
} satisfies Record<RankedEntry["queueType"], string>;
export const RANK_HISTORY_LIMIT = 90;
const divisions = ["IV", "III", "II", "I"] as const;
const apexStart = LEAGUE_TIERS.indexOf("MASTER") * divisions.length * 100;

export type RankHistoryQueue = keyof typeof RANK_HISTORY_QUEUES;

export interface RankHistoryPoint {
  day: string;
  year: number | null;
  tier: LeagueTier;
  division: string;
  lp: number;
  wins: number;
  losses: number;
}

export interface QueueRankHistory {
  queue: RankHistoryQueue;
  recent: RankHistoryPoint[];
  previousYears: RankHistoryPoint[];
}

export function rankHistoryLabel({ tier, division, lp }: RankHistoryPoint) {
  return rankLabel(tier, LEAGUE_TIERS.indexOf(tier) >= LEAGUE_TIERS.indexOf("MASTER") ? null : division, lp);
}

/** Ranked divisions occupy consecutive 100 LP bands. Apex tiers share an LP ladder. */
export function rankHistoryPosition({ tier, division, lp }: RankHistoryPoint) {
  const tierIndex = LEAGUE_TIERS.indexOf(tier);
  if (tierIndex >= LEAGUE_TIERS.indexOf("MASTER")) return apexStart + lp;
  const divisionIndex = divisions.findIndex(value => value === division);
  return (tierIndex * divisions.length + divisionIndex) * 100 + lp;
}

export function rankHistoryPositionLabel(position: number) {
  if (position >= apexStart) return `Apex ${position - apexStart} LP`;
  if (position < 0) return `Iron IV · ${position} LP`;
  const division = Math.floor(position / 100);
  return rankLabel(LEAGUE_TIERS[Math.floor(division / divisions.length)], divisions[division % divisions.length], position % 100);
}

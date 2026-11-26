import { leagueTier, rankLabel, type LeagueTier } from "./rank";
import type { Player } from "./riot";

const solo = "RANKED_SOLO_5x5";
const flex = "RANKED_FLEX_SR";
const queueNames = { [solo]: "Ranked Solo/Duo", [flex]: "Ranked Flex" } as const;
const PLAYER_CACHE_TTL_MS = 10 * 60 * 1000;
const snapshotDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export interface RankedEntry {
  queueType: typeof solo | typeof flex;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

const divisions = new Set(["IV","III","II","I"]);
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

// A successful [] means Riot returned no placed entries. A malformed or missing payload
// must never overwrite a known-good record with "Unranked". Irrelevant queues are ignored.
export function readRankedEntries(payload: unknown): RankedEntry[] | undefined {
  if (!Array.isArray(payload)) return undefined;
  const entries: RankedEntry[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry.queueType !== "string") return undefined;
    const { queueType, tier, rank, leaguePoints, wins, losses } = entry;
    if (queueType !== solo && queueType !== flex) continue;
    if (entries.some(e => e.queueType === queueType) || !leagueTier(tier) || !divisions.has(rank) ||
        !Number.isSafeInteger(leaguePoints) || !isCount(wins) || !isCount(losses)) return undefined;
    entries.push({ queueType, tier, rank, leaguePoints, wins, losses });
  }
  return entries;
}

type Count = {name: string; games: number};

export type PublicRankedRecord = ReturnType<typeof record> & {
  queue: typeof queueNames[keyof typeof queueNames];
  rank: string;
  tier: LeagueTier;
};

export interface PublicPlayerSummary {
  rank: string;
  tier: LeagueTier | null;
  rankStatus: "ranked" | "unranked" | "unavailable";
  queue: "Ranked Solo/Duo" | "Ranked Flex";
  wins: number | null;
  losses: number | null;
  games: number | null;
  winRate: number | null;
  rankedGames: number | null;
  rankedWins: number | null;
  rankedLosses: number | null;
  rankedWinRate: number | null;
  rankedGamesScope: "solo-and-flex" | "selected-queue";
  hasBothQueues: boolean;
  rankedRecords: PublicRankedRecord[];
  topRole: Count | null;
  champions: Count[];
  sampleGames: number;
  asOf: string | null;
  snapshotFresh: boolean;
}

const roleNames: Record<string,string> = {TOP:"Top", JUNGLE:"Jungle", MIDDLE:"Mid", BOTTOM:"Bot", UTILITY:"Support"};

function record(wins: unknown, losses: unknown) {
  if (!isCount(wins) || !isCount(losses)) return {wins:null, losses:null, games:null, winRate:null};
  const games = wins + losses;
  return { wins, losses, games, winRate: games ? Math.round(100 * wins / games) : null };
}

type RankFields = Pick<Player, "rankTier" | "rankDiv" | "rankedEntries"> & {rankLp?: number | null; fetchedAt?: string};

export function playerSnapshotTiming(fetchedAt: string, now = Date.now()) {
  const at = Date.parse(fetchedAt);
  if (!Number.isFinite(at) || at > now) return { asOf: null, fresh: false };
  const snapshot = new Date(at);
  const fresh = now - at < PLAYER_CACHE_TTL_MS && snapshot.getUTCFullYear() === new Date(now).getUTCFullYear();
  return { asOf: snapshot.toISOString(), fresh };
}

function formatPlacedRank(tier: LeagueTier, division?: string | null, lp?: number | null) {
  const apex = tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER";
  return rankLabel(tier, apex ? null : division, lp);
}

export function placedRank(player: RankFields, withLp = false) {
  const entries = player.rankedEntries;
  const chosen = entries?.find(e => e.queueType === solo) ?? entries?.[0];
  const legacy = entries === undefined && leagueTier(player.rankTier) !== null;
  const tier = leagueTier(chosen?.tier ?? (legacy ? player.rankTier : null));
  const rankStatus = tier ? "ranked" : entries !== undefined ? "unranked" : "unavailable";
  const rank = tier ? formatPlacedRank(tier, chosen?.rank ?? player.rankDiv, withLp ? chosen?.leaguePoints ?? player.rankLp : null)
    : rankStatus === "unranked" ? "Unranked" : "Rank unavailable";
  const queue = chosen?.queueType === flex ? "Ranked Flex" as const : "Ranked Solo/Duo" as const;
  return { chosen, legacy, rank, tier, rankStatus, queue } as const;
}

// Short social surfaces attribute a Flex rank to its queue. They need at most the
// two ranked entries and the Solo/Duo legacy columns, without transferring match history.
export function socialRankLabel(player: RankFields, withLp = false) {
  const { rank, queue, rankStatus } = placedRank(player, withLp);
  const queueLabel = queue === "Ranked Flex" ? `${rank} (Flex)` : rank;
  if (rankStatus === "unavailable" || player.fetchedAt === undefined) return queueLabel;
  const timing = playerSnapshotTiming(player.fetchedAt);
  if (timing.fresh) return queueLabel;
  return timing.asOf ? `${queueLabel} · as of ${snapshotDate.format(new Date(timing.asOf))}` : `${queueLabel} · last known`;
}

export function playerFlair(player: RankFields, champion: unknown) {
  const rank = socialRankLabel(player);
  return typeof champion === "string" && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(champion) ? `${rank} · ${champion} main` : rank;
}

// League-V4 supplies current ladder counts by queue. The capped all-queue Match-V5 sample
// supplies only roles and champions. A missing entry can include a player still in placements.
export function publicPlayerSummary(player: Player, now = Date.now()): PublicPlayerSummary {
  const entries = player.rankedEntries;
  const { chosen, legacy, rank, tier, rankStatus, queue } = placedRank(player, true);
  const selected = record(chosen?.wins ?? (legacy ? player.rankWins : null), chosen?.losses ?? (legacy ? player.rankLosses : null));
  const total = entries?.length ? record(entries.reduce((n, e) => n + e.wins, 0), entries.reduce((n, e) => n + e.losses, 0)) : selected;
  const rankedRecords: PublicRankedRecord[] = [solo, flex].flatMap((queueType) => {
    const entry = entries?.find((item) => item.queueType === queueType);
    const entryTier = leagueTier(entry?.tier);
    return entry && entryTier ? [{
      queue: queueNames[entry.queueType], rank: formatPlacedRank(entryTier, entry.rank, entry.leaguePoints),
      tier: entryTier, ...record(entry.wins, entry.losses),
    }] : [];
  });
  if (legacy && tier) rankedRecords.push({ queue, rank, tier, ...selected });

  const { games, champPool, roles } = player.snapshot;
  const sampleGames = isCount(games) && games <= 20 ? games : 0;
  const countInSample = (n: unknown): n is number => isCount(n) && n > 0 && n <= sampleGames;
  const champions = champPool.filter(c => countInSample(c.games) && c.champion)
    .map(c => ({name:c.champion, games:c.games})).sort((a,b) => b.games-a.games || a.name.localeCompare(b.name)).slice(0,3);
  const knownRoles = Object.entries(roleNames).filter(([key]) => countInSample(roles[key]));
  const high = Math.max(0, ...knownRoles.map(([key]) => roles[key]));
  const topRole = high ? { name: knownRoles.filter(([key]) => roles[key] === high).map(([, label]) => label).join(" / "), games: high } : null;
  const timing = playerSnapshotTiming(player.fetchedAt, now);
  return {
    rank, tier, rankStatus, queue, ...selected,
    rankedGames: total.games, rankedWins: total.wins, rankedLosses: total.losses, rankedWinRate: total.winRate,
    rankedGamesScope: entries !== undefined ? "solo-and-flex" : "selected-queue", hasBothQueues: entries?.length === 2,
    rankedRecords, topRole, champions, sampleGames, asOf: timing.asOf, snapshotFresh: timing.fresh,
  };
}

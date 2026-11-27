import type { MatchSummary } from "./pure";
import { validRating } from "./match-performance";

/**
 * OP.GG/Mobalytics-style retention layer over the stored last-20 snapshot.
 *
 * Data honesty notes:
 * - Stored match details keep only champion/name/rating for the other nine
 *   players, so per-dimension opponent splits do not exist. Dimension scores
 *   are therefore percentiles against a pool of stored games sampled from
 *   other players' snapshots (see performance-pool.ts), split by role first.
 * - No damage figure is stored for anyone, so there is no Damage dimension;
 *   Aggression is kill participation only. Dimensions without an adequate
 *   pool are omitted rather than estimated.
 */

export interface PoolGame {
  playerKey: string;
  role: string;
  csPerMin: number | null;
  killParticipation: number | null;
  kda: number | null;
  visionPerMin: number | null;
  rating: number | null;
}

export const INDEX_MIN_GAMES = 5;
export const INDEX_MIN_DIMENSIONS = 4;
export const POOL_MIN_GAMES = 30;
export const POOL_MIN_CONSISTENCY_PLAYERS = 10;
export const CONSISTENCY_MIN_RATED = 5;

const ROLE_LABELS: Record<string, string> = {
  TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support",
};
const ROLES = Object.keys(ROLE_LABELS);

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function minutesOf(durationSec: unknown): number | null {
  return isCount(durationSec) && durationSec > 0 ? durationSec / 60 : null;
}

/** Per-game dimension scalars for one stored match; null when unmeasured. */
export function gameScalars(match: MatchSummary): Omit<PoolGame, "playerKey" | "role"> {
  const minutes = minutesOf(match.durationSec);
  const kda = isCount(match.kills) && isCount(match.deaths) && isCount(match.assists)
    ? (match.kills + match.assists) / Math.max(1, match.deaths) : null;
  return {
    csPerMin: minutes && isCount(match.cs) ? match.cs / minutes : null,
    killParticipation: typeof match.killParticipation === "number" && match.killParticipation >= 0 && match.killParticipation <= 1
      ? match.killParticipation : null,
    kda,
    visionPerMin: minutes && isCount(match.vision) ? match.vision / minutes : null,
    rating: validRating(match.performanceRating) ? match.performanceRating : null,
  };
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function stdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

/** Percentile of `value` within `pool` (0–100), ties counting half. */
export function percentileOf(value: number, pool: readonly number[]): number {
  if (!pool.length) return 0;
  let below = 0, equal = 0;
  for (const entry of pool) {
    if (entry < value) below++;
    else if (entry === value) equal++;
  }
  return Math.round(100 * (below + equal / 2) / pool.length);
}

export type DimensionKey = "farming" | "aggression" | "survival" | "vision" | "consistency";

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  /** 0–100 percentile score against the pool. */
  score: number;
  percentile: number;
  /** The player's raw average, in the dimension's display unit. */
  playerAvg: number;
  poolAvg: number;
  playerGames: number;
  poolGames: number;
  poolScope: "role" | "all";
}

export interface DimensionCallout {
  key: DimensionKey;
  label: string;
  percentile: number;
  sentence: string;
}

export interface PerformanceIndex {
  score: number;
  games: number;
  role: string | null;
  roleLabel: string | null;
  dimensions: DimensionScore[];
  strengths: DimensionCallout[];
  focus: DimensionCallout[];
}

const DIMENSION_DEFS: {
  key: Exclude<DimensionKey, "consistency">;
  label: string;
  scalar: (game: PoolGame) => number | null;
  format: (value: number) => string;
  sentence: (own: string, percentile: number, scope: string) => string;
}[] = [
  {
    key: "farming", label: "Farming",
    scalar: game => game.csPerMin,
    format: value => `${value.toFixed(1)} CS/min`,
    sentence: (own, pct, scope) => `Farming ${own} — better than ${pct}% of ${scope}.`,
  },
  {
    key: "aggression", label: "Aggression",
    scalar: game => game.killParticipation,
    format: value => `${Math.round(value * 100)}% kill participation`,
    sentence: (own, pct, scope) => `Aggression ${own} — better than ${pct}% of ${scope}.`,
  },
  {
    key: "survival", label: "Survival",
    scalar: game => game.kda,
    format: value => `${value.toFixed(2)} KDA`,
    sentence: (own, pct, scope) => `Survival ${own} — better than ${pct}% of ${scope}.`,
  },
  {
    key: "vision", label: "Vision",
    scalar: game => game.visionPerMin,
    format: value => `${value.toFixed(1)} vision/min`,
    sentence: (own, pct, scope) => `Vision ${own} — better than ${pct}% of ${scope}.`,
  },
];

function primaryRole(matches: readonly MatchSummary[]): string | null {
  const counts = new Map<string, number>();
  for (const match of matches) if (ROLES.includes(match.role)) counts.set(match.role, (counts.get(match.role) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function buildPerformanceIndex(matches: readonly MatchSummary[], pool: readonly PoolGame[]): PerformanceIndex | null {
  if (matches.length < INDEX_MIN_GAMES) return null;
  const role = primaryRole(matches);
  const roleLabel = role ? ROLE_LABELS[role] : null;
  const ownGames: PoolGame[] = matches.map(match => ({ playerKey: "self", role: match.role, ...gameScalars(match) }));
  const dimensions: DimensionScore[] = [];

  for (const def of DIMENSION_DEFS) {
    const ownValues = ownGames.map(def.scalar).filter((value): value is number => value !== null);
    const ownAvg = mean(ownValues);
    if (ownAvg === null) continue;
    const rolePool = role ? pool.filter(game => game.role === role).map(def.scalar).filter((value): value is number => value !== null) : [];
    const allPool = pool.map(def.scalar).filter((value): value is number => value !== null);
    const scoped = rolePool.length >= POOL_MIN_GAMES ? { values: rolePool, scope: "role" as const } : { values: allPool, scope: "all" as const };
    if (scoped.values.length < POOL_MIN_GAMES) continue;
    const poolAvg = mean(scoped.values);
    if (poolAvg === null) continue;
    const percentile = percentileOf(ownAvg, scoped.values);
    dimensions.push({
      key: def.key, label: def.label, score: percentile, percentile,
      playerAvg: ownAvg, poolAvg, playerGames: ownValues.length, poolGames: scoped.values.length, poolScope: scoped.scope,
    });
  }

  // Consistency: steadiness of the per-game Baron Match Rating. The pool is
  // other sampled players (grouped by player), not individual games.
  const ownRatings = ownGames.map(game => game.rating).filter((value): value is number => value !== null);
  if (ownRatings.length >= CONSISTENCY_MIN_RATED) {
    const ownSpread = stdDev(ownRatings);
    const byPlayer = new Map<string, number[]>();
    for (const game of pool) {
      if (game.rating === null || game.playerKey === "self") continue;
      const list = byPlayer.get(game.playerKey) ?? [];
      list.push(game.rating);
      byPlayer.set(game.playerKey, list);
    }
    const poolScalars = [...byPlayer.values()]
      .filter(ratings => ratings.length >= CONSISTENCY_MIN_RATED)
      .map(ratings => stdDev(ratings))
      .filter((value): value is number => value !== null)
      .map(spread => -spread);
    if (ownSpread !== null && poolScalars.length >= POOL_MIN_CONSISTENCY_PLAYERS) {
      const percentile = percentileOf(-ownSpread, poolScalars);
      dimensions.push({
        key: "consistency", label: "Consistency", score: percentile, percentile,
        playerAvg: ownSpread, poolAvg: Math.abs(mean(poolScalars) ?? 0), playerGames: ownRatings.length,
        poolGames: poolScalars.length, poolScope: "all",
      });
    }
  }

  if (dimensions.length < INDEX_MIN_DIMENSIONS) return null;
  const ranked = [...dimensions].sort((a, b) => b.percentile - a.percentile);
  const scopeText = (dimension: DimensionScore) =>
    dimension.poolScope === "role" && roleLabel ? `${roleLabel} games in the Baron Pit sample` : "games in the Baron Pit sample";
  const callout = (dimension: DimensionScore): DimensionCallout => {
    if (dimension.key === "consistency") {
      return {
        key: dimension.key, label: dimension.label, percentile: dimension.percentile,
        sentence: `Consistency — a game-to-game rating spread of ${dimension.playerAvg.toFixed(1)} — steadier than ${dimension.percentile}% of sampled players.`,
      };
    }
    const def = DIMENSION_DEFS.find(entry => entry.key === dimension.key)!;
    return {
      key: dimension.key, label: dimension.label, percentile: dimension.percentile,
      sentence: def.sentence(def.format(dimension.playerAvg), dimension.percentile, scopeText(dimension)),
    };
  };
  return {
    score: Math.round(dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length),
    games: matches.length,
    role, roleLabel,
    dimensions,
    strengths: ranked.slice(0, 2).map(callout),
    focus: ranked.slice(-2).reverse().map(callout),
  };
}

/* ---------------- Personal bests ---------------- */

export interface PersonalBest {
  key: "rating" | "kills" | "farming" | "kda" | "streak";
  label: string;
  value: string;
  champion: string;
  win: boolean;
  matchId: string;
}

export function personalBests(matches: readonly MatchSummary[]): PersonalBest[] {
  const bests: PersonalBest[] = [];
  const rated = matches.filter(match => validRating(match.performanceRating));
  if (rated.length) {
    const best = rated.reduce((top, match) => (match.performanceRating! > top.performanceRating! ? match : top));
    bests.push({ key: "rating", label: "Best match rating", value: best.performanceRating!.toFixed(1), champion: best.champion, win: best.win, matchId: best.matchId });
  }
  const scored = matches.filter(match => isCount(match.kills));
  if (scored.length) {
    const best = scored.reduce((top, match) => (match.kills > top.kills ? match : top));
    bests.push({ key: "kills", label: "Most kills", value: `${best.kills} kills`, champion: best.champion, win: best.win, matchId: best.matchId });
  }
  const farmed = matches.filter(match => isCount(match.cs) && isCount(match.durationSec) && match.durationSec >= 300);
  if (farmed.length) {
    const best = farmed.reduce((top, match) => (match.cs / match.durationSec > top.cs / top.durationSec ? match : top));
    bests.push({ key: "farming", label: "Best farm", value: `${(best.cs * 60 / best.durationSec).toFixed(1)} CS/min`, champion: best.champion, win: best.win, matchId: best.matchId });
  }
  if (matches.length >= INDEX_MIN_GAMES) {
    const kdaGames = matches.filter(match => isCount(match.kills) && isCount(match.deaths) && isCount(match.assists));
    if (kdaGames.length) {
      const ratio = (match: MatchSummary) => (match.kills + match.assists) / Math.max(1, match.deaths);
      const best = kdaGames.reduce((top, match) => (ratio(match) > ratio(top) ? match : top));
      bests.push({
        key: "kda", label: "Best KDA", value: best.deaths === 0 ? "Perfect" : ratio(best).toFixed(2),
        champion: best.champion, win: best.win, matchId: best.matchId,
      });
    }
  }
  // Longest win streak in the window, walked oldest → newest.
  let run = 0, longest = 0, longestEnd: MatchSummary | null = null;
  for (const match of [...matches].reverse()) {
    run = match.win ? run + 1 : 0;
    if (run > longest) { longest = run; longestEnd = match; }
  }
  if (longest >= 2 && longestEnd) {
    bests.push({ key: "streak", label: "Longest win streak", value: `${longest} games`, champion: longestEnd.champion, win: true, matchId: longestEnd.matchId });
  }
  return bests;
}

/* ---------------- Form curve ---------------- */

export interface FormPoint {
  matchId: string;
  champion: string;
  rating: number;
  win: boolean;
}

export interface FormCurve {
  /** Chronological (oldest → newest) rated games. */
  points: FormPoint[];
  average: number;
  lastFiveAvg: number | null;
  previousAvg: number | null;
  delta: number | null;
  sentence: string;
}

export function formCurve(matches: readonly MatchSummary[]): FormCurve | null {
  const points = matches
    .filter(match => validRating(match.performanceRating))
    .map(match => ({ matchId: match.matchId, champion: match.champion, rating: match.performanceRating!, win: match.win }))
    .reverse();
  if (points.length < 3) return null;
  const average = mean(points.map(point => point.rating))!;
  if (points.length < 6) {
    return {
      points, average, lastFiveAvg: null, previousAvg: null, delta: null,
      sentence: `Across ${points.length} rated games in this window, the average Baron Match Rating is ${average.toFixed(1)}.`,
    };
  }
  const lastFiveAvg = mean(points.slice(-5).map(point => point.rating))!;
  const previousAvg = mean(points.slice(0, -5).map(point => point.rating))!;
  const delta = lastFiveAvg - previousAvg;
  const sentence = delta >= 0.05
    ? `Form trending up: rating ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} over the last 5 rated games.`
    : delta <= -0.05
      ? `Form trending down: rating ${delta.toFixed(1)} over the last 5 rated games.`
      : `Form steady: rating ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} over the last 5 rated games.`;
  return { points, average, lastFiveAvg, previousAvg, delta, sentence };
}

/* ---------------- Duo synergy ---------------- */

export interface DuoPartner {
  name: string;
  tag: string;
  games: number;
  wins: number;
  losses: number;
}

export function teammateRecords(matches: readonly MatchSummary[]): DuoPartner[] {
  const records = new Map<string, DuoPartner>();
  for (const match of matches) {
    const seen = new Set<string>();
    for (const mate of match.teammates ?? []) {
      if (!mate.name || !mate.tag) continue;
      const key = `${mate.name}#${mate.tag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const record = records.get(key) ?? { name: mate.name, tag: mate.tag, games: 0, wins: 0, losses: 0 };
      record.games++;
      if (match.win) record.wins++;
      else record.losses++;
      records.set(key, record);
    }
  }
  return [...records.values()].sort((a, b) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name));
}

export function duoSynergy(matches: readonly MatchSummary[], minGames = 3): DuoPartner | null {
  return teammateRecords(matches).find(record => record.games >= minGames) ?? null;
}

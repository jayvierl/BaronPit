import catalog from "./champion-catalog.json";
import { isEarlySurrender, validRating } from "./match-performance";
import type { MatchSummary } from "./pure";

const MAX_MATCHES = 100;
const RECENT_MATCHES = 20;
const WEEK_MS = 7 * 86_400_000;
const roleNames = new Map([
  ["TOP", "Top"], ["JUNGLE", "Jungle"], ["MIDDLE", "Mid"], ["BOTTOM", "Bot"], ["UTILITY", "Support"],
]);
const classes = new Set(["Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"]);
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const champKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const championsByName = new Map(catalog.list.flatMap(champion => [[champKey(champion.id), champion], [champKey(champion.name), champion]] as const));

export type GameRecord = { games: number; wins: number; losses: number };
type Share = { name: string; count: number };
export type Metric = { value: number | null; count: number };
type Performance = {
  games: number;
  winRate: Metric;
  kda: Metric;
  killParticipation: Metric;
  gameLength: Metric;
};

function gameRecord(wins: number, games: number): GameRecord {
  return { games, wins, losses: games - wins };
}

function average(values: readonly number[]): Metric {
  return { value: values.length ? values.reduce((total, value) => total + value, 0) / values.length : null, count: values.length };
}

function measuredCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function performance(matches: readonly MatchSummary[]): Performance {
  let kills = 0, assists = 0, deaths = 0, kdaGames = 0;
  const participation: number[] = [];
  const duration: number[] = [];
  for (const game of matches) {
    if (measuredCount(game.kills) && measuredCount(game.deaths) && measuredCount(game.assists)) {
      kills += game.kills;
      assists += game.assists;
      deaths += game.deaths;
      kdaGames++;
    }
    if (typeof game.killParticipation === "number" && game.killParticipation >= 0 && game.killParticipation <= 1) {
      participation.push(game.killParticipation * 100);
    }
    if (measuredCount(game.durationSec) && game.durationSec > 0) duration.push(game.durationSec);
  }
  const wins = matches.filter(game => game.win).length;
  return {
    games: matches.length,
    winRate: { value: matches.length ? wins * 100 / matches.length : null, count: matches.length },
    kda: { value: deaths > 0 ? (kills + assists) / deaths : null, count: kdaGames },
    killParticipation: average(participation), gameLength: average(duration),
  };
}

function championRecord(id: string, name: string, matches: readonly MatchSummary[]) {
  const validCS = matches.filter(match => measuredCount(match.cs) && measuredCount(match.durationSec) && match.durationSec > 0);
  const minions = validCS.reduce((total, match) => total + match.cs, 0);
  const minutes = validCS.reduce((total, match) => total + match.durationSec / 60, 0);
  const ratings = matches.flatMap(match => validRating(match.performanceRating) ? [match.performanceRating] : []);
  const shares = matches.flatMap(match => typeof match.teamDamageShare === "number" && Number.isFinite(match.teamDamageShare) &&
    match.teamDamageShare >= 0 && match.teamDamageShare <= 1 ? [match.teamDamageShare] : []);
  return { id, name, ...gameRecord(matches.filter(match => match.win).length, matches.length),
    kda: performance(matches).kda, csPerMinute: { value: minutes ? minions / minutes : null, count: validCS.length },
    rating: { value: ratings.length ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length : null, count: ratings.length },
    // Newest-first input: keep the last 20 rated games, displayed oldest to newest.
    ratingSeries: ratings.slice(0, 20).reverse(),
    damageShare: { value: shares.length ? shares.reduce((total, share) => total + share, 0) / shares.length : null, count: shares.length } };
}

export type FormSide = {
  games: number;
  winRate: Metric;
  kda: Metric;
  csPerMinute: Metric;
  rating: Metric;
};

function formSide(matches: readonly MatchSummary[]): FormSide {
  const validCS = matches.filter(match => measuredCount(match.cs) && measuredCount(match.durationSec) && match.durationSec > 0);
  const minutes = validCS.reduce((total, match) => total + match.durationSec / 60, 0);
  const ratings = matches.flatMap(match => validRating(match.performanceRating) ? [match.performanceRating] : []);
  const base = performance(matches);
  return {
    games: matches.length, winRate: base.winRate, kda: base.kda,
    csPerMinute: { value: minutes ? validCS.reduce((total, match) => total + match.cs, 0) / minutes : null, count: validCS.length },
    rating: { value: ratings.length ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length : null, count: ratings.length },
  };
}

/** Recent form vs the previous block of the same size, remakes excluded.
 * With 40+ counted games this is last 20 vs previous 20; below that it splits
 * what is available into two halves so both sides stay comparable. */
export function formComparison(matches: readonly MatchSummary[]) {
  const counted = matches.filter(match => !isEarlySurrender(match));
  const half = counted.length >= 40 ? 20 : Math.ceil(counted.length / 2);
  const latest = formSide(counted.slice(0, half));
  const earlier = formSide(counted.slice(half, half * 2));
  return { latest, earlier };
}

export type FormComparison = ReturnType<typeof formComparison>;

function sortedShares(counts: Map<string, number>): Share[] {
  return [...counts].map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
}

function addShare(counts: Map<string, number>, name: string, amount: number) {
  counts.set(name, (counts.get(name) ?? 0) + amount);
}

function activityCounts(matches: readonly MatchSummary[], now: number) {
  const days = weekdayNames.map(name => ({ name, ...gameRecord(0, 0) }));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, ...gameRecord(0, 0) }));
  let knownTimes = 0;
  for (const match of matches) {
    if (!timeKnown(match.playedAt, now)) continue;
    const date = new Date(match.playedAt);
    knownTimes++;
    for (const bin of [days[(date.getUTCDay() + 6) % 7], hours[date.getUTCHours()]]) {
      bin.games++;
      if (match.win) bin.wins++;
      else bin.losses++;
    }
  }
  return { days, hours, knownTimes };
}

function timeKnown(value: unknown, now: number): value is number {
  return measuredCount(value) && value > 0 && value <= Math.min(now, 8.64e15);
}

export function buildPlayerAnalytics(matches: readonly MatchSummary[], now = Date.now(),
  options?: { excludeEarlySurrenders?: boolean }) {
  // Keep chronology from Riot's newest-first list. A malformed row or duplicate should never inflate a metric.
  const ids = new Set<string>();
  const sample = matches.slice(0, MAX_MATCHES).filter(match => {
    if (!match || typeof match.matchId !== "string" || !match.matchId || typeof match.win !== "boolean" || ids.has(match.matchId)) return false;
    ids.add(match.matchId);
    // Opt-in: remakes and early surrenders flagged by the rating evidence do
    // not count toward form, win rates or per-champion records.
    if (options?.excludeEarlySurrenders && isEarlySurrender(match)) return false;
    return true;
  });
  const roles = new Map<string, number>();
  const roleGames = new Map<string, MatchSummary[]>();
  const matchupGames = new Map<string, { wins: number; games: number }>();
  const classShares = new Map<string, number>();
  const championGames = new Map<string, { name: string; matches: MatchSummary[] }>();
  const rankedWeek = new Map<string, { id: string; name: string; wins: number; games: number }>();
  let knownRoles = 0, knownClasses = 0;
  const weekStart = now - WEEK_MS;

  for (const match of sample) {
    const role = roleNames.get(match.role);
    if (role) {
      knownRoles++;
      addShare(roles, role, 1);
      const list = roleGames.get(role) ?? [];
      list.push(match);
      roleGames.set(role, list);
    }
    if (typeof match.opponentChampion === "string" && match.opponentChampion) {
      const matchup = matchupGames.get(match.opponentChampion) ?? { wins: 0, games: 0 };
      matchup.games++;
      if (match.win) matchup.wins++;
      matchupGames.set(match.opponentChampion, matchup);
    }
    if (typeof match.champion !== "string" || !match.champion || match.champion.length > 64) continue;
    const info = championsByName.get(champKey(match.champion));
    if (!info && !/^[A-Za-z0-9]+$/.test(match.champion)) continue;
    const id = info?.id ?? match.champion;
    const name = info?.name ?? match.champion;
    const tags = [...new Set(info?.tags.filter(tag => classes.has(tag)) ?? [])];
    if (tags.length) {
      knownClasses++;
      for (const tag of tags) addShare(classShares, tag, 1 / tags.length);
    }
    const champion = championGames.get(id) ?? { name, matches: [] };
    champion.matches.push(match);
    championGames.set(id, champion);
    if ((match.queueId === 420 || match.queueId === 440) && timeKnown(match.playedAt, now) && match.playedAt >= weekStart) {
      const record = rankedWeek.get(id) ?? { id, name, wins: 0, games: 0 };
      record.games++;
      if (match.win) record.wins++;
      rankedWeek.set(id, record);
    }
  }

  const byGames = (a: { games: number; name: string }, b: { games: number; name: string }) => b.games - a.games || a.name.localeCompare(b.name);
  const roleRecords = [...roleGames].map(([name, games]) => {
    const ratings = games.flatMap(match => validRating(match.performanceRating) ? [match.performanceRating] : []);
    return { name, ...gameRecord(games.filter(match => match.win).length, games.length),
      rating: { value: ratings.length ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length : null, count: ratings.length } };
  }).sort(byGames).map((record, index) => ({ ...record, preferred: index === 0 && record.games > 0 }));
  return {
    sampleGames: sample.length,
    roles: sortedShares(roles), knownRoles, roleRecords,
    // Head-to-head mini-records need at least two meetings to say anything.
    matchups: [...matchupGames].map(([name, record]) => ({ name, ...gameRecord(record.wins, record.games) }))
      .filter(record => record.games >= 2).sort(byGames),
    classes: sortedShares(classShares), knownClasses,
    champions: [...championGames].map(([id, champion]) => championRecord(id, champion.name, champion.matches)).sort(byGames),
    rankedWeek: [...rankedWeek.values()].map(({ id, name, wins, games }) => ({ id, name, ...gameRecord(wins, games) })).sort(byGames),
    weekStart, asOf: now,
    performance: { latest: performance(sample.slice(0, RECENT_MATCHES)), earlier: performance(sample.slice(RECENT_MATCHES)) },
    activity: activityCounts(sample, now),
  };
}

export type PlayerAnalytics = ReturnType<typeof buildPlayerAnalytics>;

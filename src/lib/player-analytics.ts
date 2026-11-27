import catalog from "./champion-catalog.json";
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
  return { id, name, ...gameRecord(matches.filter(match => match.win).length, matches.length),
    kda: performance(matches).kda, csPerMinute: { value: minutes ? minions / minutes : null, count: validCS.length } };
}

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

export function buildPlayerAnalytics(matches: readonly MatchSummary[], now = Date.now()) {
  // Keep chronology from Riot's newest-first list. A malformed row or duplicate should never inflate a metric.
  const ids = new Set<string>();
  const sample = matches.slice(0, MAX_MATCHES).filter(match => {
    if (!match || typeof match.matchId !== "string" || !match.matchId || typeof match.win !== "boolean" || ids.has(match.matchId)) return false;
    ids.add(match.matchId);
    return true;
  });
  const roles = new Map<string, number>();
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
  return {
    sampleGames: sample.length,
    roles: sortedShares(roles), knownRoles,
    classes: sortedShares(classShares), knownClasses,
    champions: [...championGames].map(([id, champion]) => championRecord(id, champion.name, champion.matches)).sort(byGames),
    rankedWeek: [...rankedWeek.values()].map(({ id, name, wins, games }) => ({ id, name, ...gameRecord(wins, games) })).sort(byGames),
    weekStart, asOf: now,
    performance: { latest: performance(sample.slice(0, RECENT_MATCHES)), earlier: performance(sample.slice(RECENT_MATCHES)) },
    activity: activityCounts(sample, now),
  };
}

export type PlayerAnalytics = ReturnType<typeof buildPlayerAnalytics>;

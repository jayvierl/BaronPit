/** Pure helpers (no server imports) — shared by riot.ts, social.ts, and tests. */

export interface MatchParticipantSummary {
  champion: string;
  name?: string;
  tag?: string;
  isPlayer?: true;
}

export interface MatchSummary {
  matchId: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  durationSec: number;
  queueId: number;
  role: string;
  playedAt: number;
  /** Authoritative Riot start time; older summaries only have the end time above. */
  startedAt?: number;
  /** Riot major.minor version for this match, where available. */
  gamePatch?: string;
  /** Champion at the same position on the opposing team, when unambiguous. */
  opponentChampion?: string;
  items: number[];
  /** Gold earned by the player this game (newer snapshots only). */
  gold?: number;
  /** Total gold earned by the player's whole team this game. */
  teamGold?: number;
  /** Exact team objective count, when returned by Match-V5. */
  teamBaronKills?: number;
  /** Older snapshots recorded only whether the team secured Baron. */
  baron?: boolean;
  /** Same-team players (excluding the player): champion + Riot name where shown. */
  teammates?: { champion: string; name: string; tag?: string }[];
  championLevel?: number;
  spellIds?: [number, number];
  runes?: { keystone: number; primaryStyle: number; secondaryStyle: number };
  teamKills?: number;
  /** Share of the team's kills in which the player participated, when known. */
  killParticipation?: number;
  /** Baron Pit contribution placement among the ten in this ranked match. A unique first place is 10. */
  performanceRating?: number;
  teams?: { allies: MatchParticipantSummary[]; opponents: MatchParticipantSummary[] };
  /** Version 2 also checked whether full source evidence supports a performance rating. */
  detailsVersion?: 1 | 2;
}

type BaronData = { teamBaronKills?: unknown; baron?: unknown };

export function teamBaronFields(match: BaronData): Pick<MatchSummary, "teamBaronKills" | "baron"> {
  const count = match.teamBaronKills;
  if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) return { teamBaronKills: count };
  // Legacy false covered both zero and unavailable objectives. Never infer a count from it.
  return typeof match.baron === "boolean" ? { baron: match.baron } : {};
}

export function teamBaronLabel(match: BaronData): string | null {
  const { teamBaronKills, baron } = teamBaronFields(match);
  if (teamBaronKills !== undefined && teamBaronKills > 1) return `Team secured ${teamBaronKills} Barons`;
  return teamBaronKills === 1 || baron ? "Team secured Baron" : null;
}

/** Compare two patch strings by major.minor ("16.23.1" vs "16.23"). */
export function samePatch(a: string, b: string): boolean {
  const seg = (s: string) => s.split(".").slice(0, 2).join(".");
  return seg(a) === seg(b);
}

export const DUO_ROLES = ["Top", "Jungle", "Mid", "ADC", "Support", "Fill"] as const;

/** Recurring schedule blocks for LFG duo matching. */
export const SCHEDULE_BLOCKS = [
  "Weekday mornings", "Weekday afternoons", "Weekday evenings", "Weekday late nights",
  "Weekend mornings", "Weekend afternoons", "Weekend evenings", "Weekend late nights",
] as const;

/**
 * Identity flair earned from a player's OWN recent form — their history,
 * never a judgment of anyone else. Snapshot-scoped (recent games only).
 */
export function earnedBadges(snapshot: PlayerSnapshot): string[] {
  const ms = snapshot.matches;
  if (snapshot.games < 5 || ms.length === 0) return [];
  const badges: string[] = [];
  const baronGames = ms.filter(m => teamBaronLabel(m) !== null).length;
  if (baronGames >= 5) badges.push(`Team secured Baron in ${baronGames} games`);
  const top = snapshot.champPool[0];
  if (top && top.games / snapshot.games >= 0.6) badges.push(`${top.champion} one-trick`);
  if (snapshot.kda >= 5) badges.push(`Sharpshooter · ${snapshot.kda.toFixed(1)} KDA`);
  const mainRole = Object.entries(snapshot.roles).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const assistsPerGame = ms.reduce((a, m) => a + m.assists, 0) / ms.length;
  if (mainRole === "UTILITY" && assistsPerGame >= 10) badges.push("Playmaker");
  const deathsPerGame = ms.reduce((a, m) => a + m.deaths, 0) / ms.length;
  if (deathsPerGame <= 2.5) badges.push("Hard to kill");
  return badges.slice(0, 3);
}

/** Data Dragon splash art for a champion (official Riot CDN). */
export function splashUrl(champion: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion}_0.jpg`;
}

export interface FormRead {
  label: string;
  value: string;
  note: string;
  tone: "good" | "mid" | "low";
}

function kdaOf(ms: MatchSummary[]): number {
  const k = ms.reduce((a, m) => a + m.kills, 0);
  const d = ms.reduce((a, m) => a + m.deaths, 0);
  const a = ms.reduce((x, m) => x + m.assists, 0);
  return (k + a) / Math.max(1, d);
}

/**
 * Light, human-readable "how they compare" reads from a recent-form snapshot.
 * Plain-language heuristics, role-aware (supports are read on playmaking, not CS).
 */
export function formReads(snapshot: PlayerSnapshot): FormRead[] {
  const ms = snapshot.matches;
  if (ms.length === 0) return [];
  const reads: FormRead[] = [];
  const last3 = ms.slice(0, 3);
  const rest = ms.slice(3);

  const w3 = last3.filter((m) => m.win).length;
  reads.push({
    label: "Recent form",
    value: `${w3}W – ${last3.length - w3}L`,
    note: rest.length ? `across the last ${last3.length} games` : "only a few games tracked",
    tone: w3 >= 2 ? "good" : w3 === 1 ? "mid" : "low",
  });

  if (rest.length >= 2) {
    const now = kdaOf(last3);
    const before = kdaOf(rest);
    const diff = now - before;
    reads.push({
      label: "KDA trend",
      value: now.toFixed(2),
      note: diff > 0.4 ? "trending up vs earlier games" : diff < -0.4 ? "cooling off vs earlier games" : "steady vs earlier games",
      tone: diff > 0.4 ? "good" : diff < -0.4 ? "low" : "mid",
    });
  }

  const mainRole = Object.entries(snapshot.roles).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const minutes = ms.reduce((a, m) => a + m.durationSec, 0) / 60;
  if (mainRole === "UTILITY") {
    const apg = ms.reduce((a, m) => a + m.assists, 0) / ms.length;
    reads.push({
      label: "Playmaking",
      value: `${apg.toFixed(1)} assists/game`,
      note: `across ${ms.length} recent games, mostly support`,
      tone: apg >= 10 ? "good" : apg >= 7 ? "mid" : "low",
    });
  } else if (minutes > 0) {
    const cspm = ms.reduce((a, m) => a + m.cs, 0) / minutes;
    reads.push({
      label: "Farming",
      value: `${cspm.toFixed(1)} CS/min`,
      note: `across ${ms.length} recent games`,
      tone: cspm >= 6 ? "good" : cspm >= 5 ? "mid" : "low",
    });
  }

  const withGold = ms.filter((m) => m.gold != null && m.teamGold);
  if (withGold.length >= 2) {
    const share = withGold.reduce((a, m) => a + (m.gold ?? 0) / Math.max(1, m.teamGold ?? 1), 0) / withGold.length;
    const pct = Math.round(share * 100);
    reads.push({
      label: "Gold share",
      value: `${pct}% of team gold`,
      note: `average across ${withGold.length} games with gold data`,
      tone: pct >= 19 ? "good" : "mid",
    });
  }
  return reads;
}

export interface PlayerSnapshot {
  games: number;
  wins: number;
  losses: number;
  kda: number;
  champPool: { champion: string; games: number; wins: number; kda: number }[];
  roles: Record<string, number>;
  matches: MatchSummary[];
  /** Earliest instant covered by this complete, visible Match-V5 sample. */
  coverageFrom?: number;
  /** Latest completed game end in that window; an in-progress game is not observable. */
  coverageThrough?: number;
}

export const EMPTY_SNAPSHOT: PlayerSnapshot = {
  games: 0, wins: 0, losses: 0, kda: 0, champPool: [], roles: {}, matches: [],
};

export function summarize(matches: MatchSummary[]): PlayerSnapshot {
  if (matches.length === 0) return EMPTY_SNAPSHOT;
  const wins = matches.filter((m) => m.win).length;
  const k = matches.reduce((a, m) => a + m.kills, 0);
  const d = matches.reduce((a, m) => a + m.deaths, 0);
  const a = matches.reduce((a, m) => a + m.assists, 0);
  const byChamp = new Map<string, { games: number; wins: number; k: number; d: number; a: number }>();
  const roles: Record<string, number> = {};
  for (const m of matches) {
    const c = byChamp.get(m.champion) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
    c.games += 1; if (m.win) c.wins += 1; c.k += m.kills; c.d += m.deaths; c.a += m.assists;
    byChamp.set(m.champion, c);
    if (m.role) roles[m.role] = (roles[m.role] ?? 0) + 1;
  }
  return {
    games: matches.length,
    wins,
    losses: matches.length - wins,
    kda: Math.round(((k + a) / Math.max(1, d)) * 100) / 100,
    champPool: [...byChamp.entries()]
      .map(([champion, s]) => ({ champion, games: s.games, wins: s.wins, kda: Math.round(((s.k + s.a) / Math.max(1, s.d)) * 100) / 100 }))
      .sort((x, y) => y.games - x.games)
      .slice(0, 8),
    roles,
    matches,
  };
}

/** FNV-1a hash — the one seed function, shared by rotation and daily picks. */
export function fnvHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/** Deterministic daily rotation: same seed + count always picks the same slot. */
export function rotationIndex(seedKey: string, count: number): number {
  return fnvHash(seedKey) % Math.max(1, count);
}

/** Shared constants (client-safe — components import these from here, not social.ts). */
export const REACTION_EMOJIS = ["🔥", "❤️", "👏", "🎯", "💜", "GG"] as const;
export const ENDORSE_KINDS = [
  { id: "good_teammate", label: "Good teammate" },
  { id: "helpful", label: "Helpful builder" },
  { id: "shot_caller", label: "Shot caller" },
] as const;

export function gameCount(games: number, scope?: "public") {
  return `${games}${scope ? ` ${scope}` : ""} ${games === 1 ? "game" : "games"}`;
}

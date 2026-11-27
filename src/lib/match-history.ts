import { isEarlySurrender } from "./match-performance";
import type { MatchSummary } from "./pure";

export const MATCH_DETAIL_LIMIT = 3;

export function matchSectionId(matchId: string): string | undefined {
  return /^[A-Za-z0-9_-]{1,80}$/.test(matchId) ? `match-${matchId}` : undefined;
}

const queueNames: Record<number, string> = {
  0: "Custom", 400: "Normal Draft", 420: "Ranked Solo/Duo", 430: "Blind Pick",
  440: "Ranked Flex", 450: "ARAM", 480: "Swiftplay", 490: "Quickplay", 700: "Clash",
};
function queueKey(queueId: number): string {
  return Number.isSafeInteger(queueId) && queueId >= 0 ? String(queueId) : "unknown";
}
export function matchQueueName(key: string): string {
  if (key === "ranked") return "Ranked (Solo/Duo and Flex)";
  return key === "unknown" ? "Queue unavailable" : queueNames[Number(key)] ?? `Queue ${key}`;
}

/** Raw Riot positions in display order; a role filter is only offered for
 * positions actually present in the sample, so it never guesses. */
export const MATCH_ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type MatchRole = (typeof MATCH_ROLE_ORDER)[number];
const roleLabels: Record<MatchRole, string> = {
  TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support",
};
export function matchRoleLabel(role: string): string {
  return (roleLabels as Record<string, string>)[role] ?? role;
}
function isMatchRole(value: string): value is MatchRole {
  return (MATCH_ROLE_ORDER as readonly string[]).includes(value);
}

/** Every count and option comes from the same bounded match sample, newest first. */
export function recentMatchHistory(matches: MatchSummary[], rawQueue?: string, rawChampion?: string, rawRole?: string) {
  const sample = matches.slice(0, 100);
  const queues = [...new Set(sample.map(m => queueKey(m.queueId)))].sort((a,b) => matchQueueName(a).localeCompare(matchQueueName(b)));
  const champions = [...new Set(sample.map(m => m.champion))].sort((a,b) => a.localeCompare(b));
  const roles = MATCH_ROLE_ORDER.filter(role => sample.some(m => m.role === role));
  const queue = typeof rawQueue === "string" && /^(?:[0-9]{1,6}|unknown|ranked)$/.test(rawQueue) ? rawQueue : "";
  const requested = typeof rawChampion === "string" ? rawChampion.trim().slice(0,64) : "";
  const champion = champions.find(name => name.toLowerCase() === requested.toLowerCase())
    ?? (/^[a-z0-9]{1,40}$/i.test(requested) ? requested : "");
  const role = typeof rawRole === "string" && isMatchRole(rawRole) ? rawRole : "";
  const filtered = sample.filter(match => {
    const inQueue = queue === "ranked" ? match.queueId === 420 || match.queueId === 440 : !queue || queueKey(match.queueId) === queue;
    return inQueue && (!champion || match.champion === champion) && (!role || match.role === role);
  });
  // Remakes and early surrenders stay in the history list (their rows explain
  // why they are unrated) but never count toward the record or win rate.
  const counted = filtered.filter(match => !isEarlySurrender(match));
  const wins = counted.filter(m => m.win).length;
  return {queues, champions, roles, queue, champion, role, sampleSize: sample.length, matches: filtered,
    wins, losses: counted.length - wins, excluded: filtered.length - counted.length,
    winRate: counted.length ? Math.round(100 * wins / counted.length) : null};
}

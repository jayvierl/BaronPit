import type { MatchSummary } from "./pure";

const queueNames: Record<number, string> = {
  0: "Custom", 400: "Normal Draft", 420: "Ranked Solo/Duo", 430: "Blind Pick",
  440: "Ranked Flex", 450: "ARAM", 490: "Quickplay", 700: "Clash",
};
function queueKey(queueId: number): string {
  return Number.isSafeInteger(queueId) && queueId >= 0 ? String(queueId) : "unknown";
}
export function matchQueueName(key: string): string {
  return key === "unknown" ? "Queue unavailable" : queueNames[Number(key)] ?? `Queue ${key}`;
}

/** Every count and option comes from the same bounded match sample, newest first. */
export function recentMatchHistory(matches: MatchSummary[], rawQueue?: string, rawChampion?: string) {
  const sample = matches.slice(0, 20);
  const queues = [...new Set(sample.map(m => queueKey(m.queueId)))].sort((a,b) => matchQueueName(a).localeCompare(matchQueueName(b)));
  const champions = [...new Set(sample.map(m => m.champion))].sort((a,b) => a.localeCompare(b));
  const queue = typeof rawQueue === "string" && /^(?:[0-9]{1,6}|unknown)$/.test(rawQueue) ? rawQueue : "";
  const requested = typeof rawChampion === "string" ? rawChampion.trim().slice(0,64) : "";
  const champion = champions.find(name => name.toLowerCase() === requested.toLowerCase())
    ?? (/^[a-z0-9]{1,40}$/i.test(requested) ? requested : "");
  const filtered = sample.filter(m => (!queue || queueKey(m.queueId) === queue) && (!champion || m.champion === champion));
  const wins = filtered.filter(m => m.win).length;
  return {queues, champions, queue, champion, sampleSize: sample.length, matches: filtered, wins,
    losses: filtered.length - wins, winRate: filtered.length ? Math.round(100 * wins / filtered.length) : null};
}

import { playerSnapshotTiming } from "./player-summary";

/** The observed uninterrupted run at the front of a fresh, newest-first Riot sample. */
export function currentWinStreak(snapshot: unknown, fetchedAt: string, now = Date.now()): number | null {
  if (!playerSnapshotTiming(fetchedAt, now).fresh || !snapshot || typeof snapshot !== "object" || !("matches" in snapshot) || !Array.isArray(snapshot.matches)) return null;
  const seen = new Map<string, number>();
  let previousAt = Date.parse(fetchedAt);
  for (const match of snapshot.matches.slice(0, 20)) {
    if (typeof match?.matchId !== "string" || !/^[A-Z0-9]+_\d{1,20}$/i.test(match.matchId) ||
      !Number.isSafeInteger(match.playedAt) || match.playedAt <= 0 || match.playedAt > previousAt ||
      typeof match.win !== "boolean") return null;
    const prior = seen.get(match.matchId);
    if (prior !== undefined) {
      if (prior !== match.playedAt || !match.win) return null;
      continue;
    }
    if (!match.win) break;
    seen.set(match.matchId, match.playedAt);
    previousAt = match.playedAt;
  }
  return seen.size >= 3 ? seen.size : null;
}

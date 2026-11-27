import { isEarlySurrender } from "./match-performance";
import type { MatchSummary } from "./pure";

export type MatchDayGroup = {
  /** UTC day key (`YYYY-MM-DD`) or "unknown" for undated matches. */
  key: string;
  label: string;
  wins: number;
  losses: number;
  /** Win percentage over counted games (remakes excluded); null when none count. */
  winRate: number | null;
  matches: MatchSummary[];
};

const DAY_MS = 86_400_000;
const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function dayKey(playedAt: number) {
  const date = new Date(playedAt);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function validTime(playedAt: unknown): playedAt is number {
  return typeof playedAt === "number" && Number.isFinite(playedAt) && playedAt > 0 && playedAt <= 8.64e15;
}

/**
 * Groups a newest-first (already filtered) match list into consecutive
 * calendar-day segments by UTC day of `playedAt` — the same UTC frame the
 * page uses for match dates. Each rendered slice is grouped independently,
 * so a day split across the latest/older boundary or an archive page simply
 * gets one header per rendered segment. Wins, losses and win rate count only
 * completed games: remakes and early surrenders stay listed in the group but
 * never count, matching the history totals above them.
 */
export function groupMatchesByDay(matches: readonly MatchSummary[], now = Date.now()): MatchDayGroup[] {
  const today = validTime(now) ? dayKey(now) : "";
  const yesterday = validTime(now) ? dayKey(now - DAY_MS) : "";
  const groups: MatchDayGroup[] = [];
  for (const match of matches) {
    const key = validTime(match.playedAt) ? dayKey(match.playedAt) : "unknown";
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const label = key === "unknown" ? "Date unavailable"
        : key === today ? "Today"
        : key === yesterday ? "Yesterday"
        : dayLabel.format(new Date(match.playedAt));
      group = { key, label, wins: 0, losses: 0, winRate: null, matches: [] };
      groups.push(group);
    }
    group.matches.push(match);
    if (!isEarlySurrender(match)) {
      if (match.win) group.wins++;
      else group.losses++;
    }
  }
  for (const group of groups) {
    const counted = group.wins + group.losses;
    group.winRate = counted ? Math.round(100 * group.wins / counted) : null;
  }
  return groups;
}

import { MATCH_DETAIL_LIMIT, matchSectionId } from "@/lib/match-history";
import type { MatchSummary } from "@/lib/pure";

const PAGE_SIZE = 10;

export function olderMatchPage(matches: readonly MatchSummary[], rawPage?: string, rawMatch?: string) {
  const archive = matches.slice(MATCH_DETAIL_LIMIT);
  const index = typeof rawMatch === "string" && matchSectionId(rawMatch)
    ? archive.findIndex(match => match.matchId === rawMatch) : -1;
  const requested = typeof rawPage === "string" && /^[1-9]\d{0,2}$/.test(rawPage) ? Number(rawPage) : null;
  const pages = Math.max(1, Math.ceil(archive.length / PAGE_SIZE));
  const page = index >= 0 ? Math.floor(index / PAGE_SIZE) + 1 : Math.min(requested ?? 1, pages);
  const offset = (page - 1) * PAGE_SIZE;
  return {
    total: archive.length, selected: index >= 0 ? archive[index].matchId : undefined, page, pages, offset,
    open: index >= 0 || requested !== null, matches: archive.slice(offset, offset + PAGE_SIZE),
  };
}

export function olderMatchHref(base: string, page: number, matchId?: string) {
  const url = new URL(base, "https://profile.invalid");
  url.searchParams.set("older", String(page));
  if (matchId) url.searchParams.set("match", matchId);
  else url.searchParams.delete("match");
  url.hash = (matchId && matchSectionId(matchId)) || "older-games";
  return url.pathname + url.search + url.hash;
}

export function matchFilterPath(base: string, queue: string, champion: string, role = "") {
  const url = new URL(base, "https://profile.invalid");
  if (queue) url.searchParams.set("queue", queue);
  if (champion) url.searchParams.set("champion", champion);
  if (role) url.searchParams.set("role", role);
  return url.pathname + url.search;
}

import { matchSectionId } from "./match-history";
import { isPlatform, playerStatsHref, splitRiotId, type PlatformId } from "./platforms";
import { isPublicMatchQueue } from "./public-match-queues";

export type DiscussionKind = "question" | "perspective";
export const matchRoleLabels = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support", TEAM: "Team" } as const;
export type MatchReference = { platform: PlatformId; riotId: string; matchId: string };
export type MatchSelection = MatchReference | { puuid: string; matchId: string };
export type MatchContext = MatchReference & {
  authorRole: "player" | "spectator";
  discussionKind?: DiscussionKind;
  region: PlatformId;
  champion: string;
  opponent: string | null;
  role: keyof typeof matchRoleLabels;
  patch: string | null;
  queueId: number;
  playedAt: number;
  durationSec: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  matchHref: string;
  sourceUpdatedAt: string;
};

export function matchRegion(id: unknown): PlatformId | null {
  const prefix = typeof id === "string" ? /^([A-Z][A-Z0-9]{1,7})_[0-9]{1,20}$/.exec(id)?.[1].toLowerCase() : null;
  return prefix && isPlatform(prefix) ? prefix : null;
}

export function safeMatchRiotId(riotId: unknown, platform: PlatformId): string | null {
  if (typeof riotId !== "string" || riotId.length > 49 || riotId.split("#").length !== 2 || /[\p{Cc}\p{Cf}]/u.test(riotId)) return null;
  const { gameName, tagLine } = splitRiotId(riotId, platform);
  return gameName.length > 0 && gameName.length <= 32 && tagLine.length > 0 && tagLine.length <= 16 ? `${gameName}#${tagLine}` : null;
}

export function parseMatchSelection(raw: Record<string, unknown>): MatchSelection | null {
  if (typeof raw.matchId !== "string" || !matchRegion(raw.matchId)) return null;
  if (typeof raw.platform === "string" && isPlatform(raw.platform) && raw.puuid == null) {
    const riotId = safeMatchRiotId(raw.riotId, raw.platform);
    return riotId ? { platform: raw.platform, riotId, matchId: raw.matchId } : null;
  }
  return raw.platform == null && raw.riotId == null && typeof raw.puuid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(raw.puuid)
    ? { puuid: raw.puuid, matchId: raw.matchId } : null;
}

export function matchContextHref({ platform, riotId, matchId }: MatchReference) {
  return `${playerStatsHref(platform, riotId)}&match=${encodeURIComponent(matchId)}#${matchSectionId(matchId)}`;
}

export function questionChampion(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(value);
}

/** Project only intentional, public evidence from a server-validated attachment. */
export function projectMatchContext(value: unknown): MatchContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<MatchContext>;
  const reference = parseMatchSelection({ platform: v.platform, riotId: v.riotId, matchId: v.matchId });
  const region = matchRegion(v.matchId);
  if (!reference || !("platform" in reference) || !region || !isPublicMatchQueue(v.queueId) || !questionChampion(v.champion) ||
      typeof v.win !== "boolean" || (v.authorRole !== "player" && v.authorRole !== "spectator") ||
      (v.discussionKind != null && v.discussionKind !== "question" && v.discussionKind !== "perspective") ||
      typeof v.sourceUpdatedAt !== "string" || !Number.isFinite(Date.parse(v.sourceUpdatedAt)) ||
      ![v.playedAt, v.durationSec, v.kills, v.deaths, v.assists, v.cs].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0) ||
      !v.durationSec || !v.playedAt || v.playedAt > Date.parse(v.sourceUpdatedAt)) return null;
  return { ...reference, region, authorRole: v.authorRole, discussionKind: v.discussionKind, champion: v.champion,
    opponent: questionChampion(v.opponent) ? v.opponent : null,
    role: v.queueId !== 450 && v.role && Object.hasOwn(matchRoleLabels, v.role) ? v.role : "TEAM",
    patch: typeof v.patch === "string" && /^\d{1,2}\.\d{1,2}$/.test(v.patch) ? v.patch : null,
    queueId: v.queueId, playedAt: v.playedAt, durationSec: v.durationSec, win: v.win,
    kills: v.kills!, deaths: v.deaths!, assists: v.assists!, cs: v.cs!,
    matchHref: matchContextHref(reference), sourceUpdatedAt: v.sourceUpdatedAt,
  };
}

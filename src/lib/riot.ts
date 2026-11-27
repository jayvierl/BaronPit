import { consumeWindow } from "./rate-window";
import { matchRegion } from "./match-context";
import { createHash } from "node:crypto";
import { q, dbAvailable, queryRows } from "./db";
import { SOCIAL_PLAYER_SELECT } from "./social-player-select";
import bundledCatalog from "./champion-catalog.json";
import { playerSnapshotTiming, readRankedEntries, type RankedEntry } from "./player-summary";

/**
 * Riot API access — on-demand recent form ONLY (build brief §2/§8).
 * A player's wp_players row holds a bounded on-demand sample. The latest 20
 * keep their existing community semantics; the profile can extend it to 100.
 */

import { PLATFORMS, isPlatform, type PlatformId } from "./platforms";
export { PLATFORMS, isPlatform };
export type { PlatformId };

import { summarize, EMPTY_SNAPSHOT, type MatchSummary, type PlayerSnapshot } from "./pure";
import { isPublicMatchQueue } from "./public-match-queues";
import { matchFromRiot, readStoredMatches } from "./riot-match";
import { eligibleForMatchRating, MATCH_DETAILS_VERSION } from "./match-performance";
export { summarize, EMPTY_SNAPSHOT };
export type { MatchSummary, PlayerSnapshot };

const COMMUNITY_MATCH_LIMIT = 20;
const PROFILE_MATCH_LIMIT = 100;
export const PLAYER_UPDATE_INTERVAL_MS = 2 * 60_000;

function regionFor(platform: string): "americas" | "europe" | "asia" | "sea" {
  if (["euw1", "eun1", "tr1", "ru"].includes(platform)) return "europe";
  if (platform === "oc1") return "sea";
  if (["kr", "jp1"].includes(platform)) return "asia";
  return "americas";
}

export interface Player {
  puuid: string;
  platform: string;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIcon: number;
  rankTier: string | null;
  rankDiv: string | null;
  rankLp: number | null;
  rankWins: number | null;
  rankLosses: number | null;
  /** Published entries from the same lookup. Legacy rows contain only Solo/Duo columns. */
  rankedEntries?: RankedEntry[];
  snapshot: PlayerSnapshot;
  matchHistory?: { matches: MatchSummary[]; complete: boolean };
  championMastery?: ChampionMastery;
  fetchedAt: string;
}

export interface ChampionMastery {
  fetchedAt: string;
  champions: { championId: number; level: number; points: number }[];
}

function key(): string | null {
  return process.env.RIOT_API_KEY ?? null;
}

export function riotConfigured(): boolean {
  return Boolean(key());
}

const APPLICATION_WINDOW = 2 * 60_000;
const APPLICATION_LIMIT = 98;
const BURST_WINDOW = 1_000;
const BURST_LIMIT = 18;
let budgetKey: string | undefined;
let apiCooldownUntil = 0;
let requestTimes: number[] = [];

function throttleBucket(k: string | null) {
  return `riot:cooldown:${createHash("sha256").update(k ?? "").digest("hex")}`;
}

function currentBudget(k: string) {
  if (budgetKey === k) return;
  budgetKey = k;
  requestTimes = [];
  apiCooldownUntil = 0;
}

function retryAt() {
  const now = Date.now();
  const k = key();
  if (!k) return undefined;
  currentBudget(k);
  const until = Math.max(apiCooldownUntil, requestTimes.length >= APPLICATION_LIMIT ? requestTimes[0] + APPLICATION_WINDOW : 0);
  return until > now ? new Date(until).toISOString() : undefined;
}

async function claimRequest(k: string, deadline: number) {
  currentBudget(k);
  for (;;) {
    const now = Date.now();
    if (budgetKey !== k || now < apiCooldownUntil || now >= deadline) return false;
    requestTimes = requestTimes.filter(at => now - at < APPLICATION_WINDOW);
    if (requestTimes.length >= APPLICATION_LIMIT) return false;
    const burst = requestTimes.filter(at => now - at < BURST_WINDOW);
    if (burst.length < BURST_LIMIT) {
      requestTimes.push(now);
      return true;
    }
    const next = burst[0] + BURST_WINDOW;
    if (next >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, Math.max(1, next - now)));
  }
}

async function riotJson(url: string, deadline = Date.now() + 6_000): Promise<{ status: number; body: unknown }> {
  const k = key();
  if (!k) return { status: 503, body: null };
  if (!(await claimRequest(k, deadline))) return { status: 429, body: null };
  if (Date.now() < apiCooldownUntil) return { status: 429, body: null };
  try {
    const res = await fetch(url, {
      headers: { "X-Riot-Token": k },
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(6_000, Math.max(1, deadline - Date.now()))),
    });
    if (res.status === 429) {
      const seconds = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(seconds) && seconds > 0 ? seconds : 5;
      const until = Math.min(8.64e15, Date.now() + wait * 1000);
      if (budgetKey === k && until > apiCooldownUntil) {
        apiCooldownUntil = until;
        // Preserve Riot's backoff across function instances. A database outage
        // still leaves this instance's guard in place.
        await q`INSERT INTO wp_action_windows(bucket,hits,expires_at)
          VALUES (${throttleBucket(k)},ARRAY[]::timestamptz[],${new Date(until).toISOString()})
          ON CONFLICT(bucket) DO UPDATE SET expires_at=excluded.expires_at
          WHERE wp_action_windows.expires_at<excluded.expires_at`.catch(() => []);
      }
    }
    if (!res.ok) return { status: res.status, body: null };
    return { status: 200, body: await res.json() };
  } catch {
    return { status: 502, body: null };
  }
}

/** One explicit timeline request uses the existing Riot key, HTTP budget and shared 429 deadline. */
export async function readRiotTimeline(matchId: string) {
  const platform = matchRegion(matchId);
  const k = key();
  if (!platform || !k) return { status: 503, body: null };
  const [cooldown] = await q`SELECT 1 FROM wp_action_windows WHERE bucket=${throttleBucket(k)} AND expires_at>now()`;
  if (cooldown || retryAt() || !await consumeWindow("riot:public-timelines", 8, 1)) return { status: 429, body: null };
  return riotJson(`https://${regionFor(platform)}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`);
}

function normalizedMastery(raw: unknown, fetchedAt: unknown): ChampionMastery | undefined {
  if (!Array.isArray(raw) || typeof fetchedAt !== "string" || !Number.isFinite(Date.parse(fetchedAt))) return undefined;
  const champions: ChampionMastery["champions"] = [];
  for (const entry of raw.slice(0, 8)) {
    if (!entry || ![entry.championId, entry.level, entry.points].every(value => Number.isSafeInteger(value) && value >= 0) ||
        entry.championId === 0 || entry.level === 0 || champions.some(existing => existing.championId === entry.championId)) return undefined;
    champions.push({ championId: entry.championId, level: entry.level, points: entry.points });
  }
  champions.sort((a, b) => b.points - a.points || a.championId - b.championId);
  return { fetchedAt, champions };
}

function storedMastery(raw: unknown): ChampionMastery | undefined {
  const stored = raw as Partial<ChampionMastery> | null;
  return stored ? normalizedMastery(stored.champions, stored.fetchedAt) : undefined;
}

export function playerFromRow(r: Record<string, unknown>): Player {
  const stored = r.snapshot as Partial<PlayerSnapshot> & { olderMatches?: unknown; historyComplete?: unknown; rankedEntries?: unknown; championMastery?: unknown } | null;
  const recent = readStoredMatches(stored?.matches, COMMUNITY_MATCH_LIMIT);
  const older = readStoredMatches(stored?.olderMatches, PROFILE_MATCH_LIMIT - COMMUNITY_MATCH_LIMIT, recent);
  // Aggregate-only rows cannot establish which games were public. Valid excluded
  // queues still count toward source completeness, as their details were retrieved.
  const snapshot = Array.isArray(stored?.matches)
    ? { ...summarize(recent.filter(match => isPublicMatchQueue(match.queueId))),
        coverageFrom: stored.coverageFrom, coverageThrough: stored.coverageThrough }
    : EMPTY_SNAPSHOT;
  const complete = stored?.historyComplete === true && older.length === (Array.isArray(stored.olderMatches) ? stored.olderMatches.length : 0) &&
    recent.length === stored.matches?.length && [...recent, ...older].every(match => Number.isSafeInteger(match.queueId) && match.queueId >= 0);
  const publicOlder = older.filter(match => isPublicMatchQueue(match.queueId));
  return {
    puuid: String(r.puuid),
    platform: String(r.platform),
    gameName: String(r.game_name),
    tagLine: String(r.tag_line),
    summonerLevel: Number(r.summoner_level ?? 0),
    profileIcon: Number(r.profile_icon ?? 0),
    rankTier: (r.rank_tier as string) ?? null,
    rankDiv: (r.rank_div as string) ?? null,
    rankLp: r.rank_lp == null ? null : Number(r.rank_lp),
    rankWins: r.rank_wins == null ? null : Number(r.rank_wins),
    rankLosses: r.rank_losses == null ? null : Number(r.rank_losses),
    rankedEntries: readRankedEntries(stored?.rankedEntries),
    championMastery: storedMastery(stored?.championMastery),
    matchHistory: typeof stored?.historyComplete === "boolean" || publicOlder.length
      ? { matches: [...snapshot.matches, ...publicOlder], complete } : undefined,
    snapshot,
    fetchedAt: String(r.fetched_at),
  };
}

export async function getCachedPlayer(puuid: string, { profile = false }: { profile?: boolean } = {}): Promise<Player | null> {
  if (!dbAvailable()) return null;
  const rows = profile ? await q`SELECT * FROM wp_players WHERE puuid = ${puuid} LIMIT 1`
    : await queryRows(`SELECT ${SOCIAL_PLAYER_SELECT} FROM wp_players p WHERE p.puuid=$1 LIMIT 1`, [puuid]);
  return rows.length ? playerFromRow(rows[0]) : null;
}

export type LookupResult =
  | { ok: true; player: Player; fresh: boolean; source: "live" | "cache" | "stale" | "partial"; retryAt?: string }
  | { ok: false; code: "not_found" | "invalid_key" | "key_unavailable" | "rate_limited" | "upstream" | "unavailable"; retryAt?: string };

type LookupScope = { force: boolean; profile: boolean };
const refreshes = new Map<string, { scope: LookupScope; task: Promise<LookupResult> }>();

export async function lookupPlayer(platform: string, gameName: string, tagLine: string, options: { force?: boolean; profile?: boolean } = {}): Promise<LookupResult> {
  if (!isPlatform(platform)) return { ok: false, code: "not_found" };
  if (!dbAvailable()) return { ok: false, code: "unavailable" };
  const name = gameName.trim(),
    tag = tagLine.trim();
  if (!name || !tag || name.length > 32 || tag.length > 16) return { ok: false, code: "not_found" };
  const id = JSON.stringify([platform, name.toLowerCase(), tag.toLowerCase()]);
  const running = refreshes.get(id);
  if (running) {
    running.scope.force ||= options.force === true;
    running.scope.profile ||= options.profile === true;
    return running.task;
  }
  const scope = { force: options.force === true, profile: options.profile === true };
  const task = loadPlayer(platform, name, tag, scope).finally(() => {
    refreshes.delete(id);
  });
  refreshes.set(id, { scope, task });
  return task;
}

async function claimRiotWindow(bucket: string) {
  const rows = await q`INSERT INTO wp_action_windows(bucket,hits,expires_at)
    VALUES (${bucket},ARRAY[now()],now()+interval '2 minutes')
    ON CONFLICT (bucket) DO UPDATE SET hits=excluded.hits,expires_at=excluded.expires_at
    WHERE wp_action_windows.expires_at<=now() RETURNING bucket`;
  return rows.length > 0;
}

function validMatchId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9]{1,7}_[0-9]{1,20}$/.test(value);
}

async function collectMatchDetails(ids: readonly string[], region: string, puuid: string, known: Map<string, MatchSummary>, deadline: number, core: ReadonlySet<string>) {
  for (let index = 0; index < ids.length && Date.now() < deadline; index += 4) {
    const batch = ids.slice(index, index + 4);
    const results = await Promise.all(batch.map(id => {
      const matchPlatform = matchRegion(id);
      const matchRoute = matchPlatform ? regionFor(matchPlatform) : region;
      return riotJson(`https://${matchRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(id)}`, deadline);
    }));
    for (const [offset, response] of results.entries()) {
      if (response.status !== 200) continue;
      const detail = matchFromRiot(response.body, batch[offset], puuid, core.has(batch[offset]));
      if (detail) known.set(detail.matchId, detail);
    }
    if (results.some(response => response.status !== 200 && response.status !== 404)) return false;
  }
  return true;
}

async function loadChampionMastery(platform: string, puuid: string) {
  const response = await riotJson(`https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=8`,
    Date.now() + 2_000);
  if (response.status !== 200 || !Array.isArray(response.body)) return undefined;
  const entries = response.body.map(entry => entry && ({ championId: entry.championId, level: entry.championLevel, points: entry.championPoints }));
  return normalizedMastery(entries, new Date().toISOString());
}

async function loadPlayer(platform: string, gameName: string, tagLine: string, scope: LookupScope): Promise<LookupResult> {
  const k = key();
  const cacheRows = await q`WITH profile AS (
    SELECT * FROM wp_players WHERE platform = ${platform} AND lower(game_name) = lower(${gameName})
      AND lower(tag_line) = lower(${tagLine}) ORDER BY fetched_at DESC,puuid LIMIT 1
  ) SELECT profile.*, throttle.expires_at AS riot_retry_at FROM (SELECT 1) seed LEFT JOIN profile ON true
    LEFT JOIN wp_action_windows throttle ON throttle.bucket=${throttleBucket(k)} AND throttle.expires_at>now()`.catch(() => null);
  if (!cacheRows) return { ok: false, code: "unavailable" };
  const [observed] = cacheRows;
  const cached = observed?.puuid ? playerFromRow(observed) : null;
  const force = scope.force;
  if (k) {
    currentBudget(k);
    const until = Date.parse(String(observed?.riot_retry_at ?? ""));
    if (Number.isFinite(until)) apiCooldownUntil = Math.max(apiCooldownUntil, until);
  }
  const eligibleAt = cached ? Date.parse(cached.fetchedAt) + PLAYER_UPDATE_INTERVAL_MS : 0;
  if (cached && ((!force && playerSnapshotTiming(cached.fetchedAt).fresh) || (force && eligibleAt > Date.now()))) {
    const resumeAt = Math.max(eligibleAt, Date.parse(retryAt() ?? "") || 0);
    return { ok: true, player: cached, fresh: false, source: "cache", ...(force && { retryAt: new Date(resumeAt).toISOString() }) };
  }
  let fallback = cached;
  const unavailable = (status: number, mastery?: ChampionMastery): LookupResult => {
    const retry = retryAt();
    const backoff = retry ? { retryAt: retry } : {};
    return fallback
      ? { ok: true, player: mastery ? { ...fallback, championMastery: mastery } : fallback, fresh: false, source: "stale", ...backoff }
      : { ok: false, code: status === 401 || status === 403 ? "invalid_key" : status === 429 ? "rate_limited" : "upstream", ...backoff };
  };
  if (!riotConfigured()) return cached ? unavailable(503) : { ok: false, code: "key_unavailable" };
  if (retryAt()) return unavailable(429);
  if (force && cached) {
    const digest = createHash("sha256").update(`${platform}:${cached.puuid}`).digest("hex");
    if (!(await claimRiotWindow(`riot:force:${digest}`).catch(() => false))) {
      return { ok: true, player: cached, fresh: false, source: "cache" };
    }
  }
  const region = regionFor(platform);
  const acct = await riotJson(
    // Account-V1 accepts americas, asia and europe; Match-V5 additionally routes Oceania through SEA.
    `https://${region === "sea" ? "asia" : region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
  if (acct.status === 404) return { ok: false, code: "not_found" };
  if (acct.status !== 200 || !acct.body) return unavailable(acct.status);
  const { puuid, gameName: realName, tagLine: realTag } = acct.body as Partial<{
    puuid: string; gameName: string; tagLine: string;
  }>;
  if (typeof puuid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(puuid) || typeof realName !== "string" || typeof realTag !== "string") {
    return unavailable(502);
  }
  // A reassigned Riot ID must never inherit the prior holder’s cached profile.
  if (cached && cached.puuid !== puuid) fallback = null;
  const observedAt = new Date().toISOString();
  const profile = scope.profile;
  const matchLimit = profile ? PROFILE_MATCH_LIMIT : COMMUNITY_MATCH_LIMIT;
  const [summ, rank, ids] = await Promise.all([
    riotJson(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`),
    riotJson(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`).then(result => ({ ...result, at: new Date().toISOString() })),
    riotJson(`https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${matchLimit}`),
  ]);
  if (summ.status === 404) return { ok: false, code: "not_found" };
  if (summ.status !== 200 || !summ.body) return unavailable(summ.status === 200 ? 502 : summ.status);

  const level = Number((summ.body as { summonerLevel?: number }).summonerLevel ?? 0);
  const icon = Number((summ.body as { profileIconId?: number }).profileIconId ?? 0);
  const rankedEntries = rank.status === 200 ? readRankedEntries(rank.body) : undefined;
  const rankObservedAt = rank.at;
  const solo = rankedEntries?.find(entry => entry.queueType === "RANKED_SOLO_5x5");
  const matchList: unknown[] | undefined = ids.status === 200 && Array.isArray(ids.body) ? ids.body.slice(0, matchLimit) : undefined;
  const rawCore = matchList?.slice(0, COMMUNITY_MATCH_LIMIT) ?? [];
  const coreIds = [...new Set(rawCore.filter(validMatchId))];
  const allIds = [...new Set(matchList?.filter(validMatchId) ?? [])];
  const olderIds = allIds.filter(id => !coreIds.includes(id)).slice(0, PROFILE_MATCH_LIMIT - COMMUNITY_MATCH_LIMIT);
  const coreSet = new Set(coreIds);
  const known = new Map((fallback?.matchHistory?.matches ?? fallback?.snapshot.matches ?? []).map(match => [match.matchId, match]));
  const storedHistory = fallback ? observed.snapshot as { matches?: unknown; olderMatches?: unknown } | null : null;
  const priorCore = readStoredMatches(storedHistory?.matches, COMMUNITY_MATCH_LIMIT, [], true);
  const priorOlder = readStoredMatches(storedHistory?.olderMatches, PROFILE_MATCH_LIMIT - COMMUNITY_MATCH_LIMIT, priorCore);
  if (fallback) {
    for (const match of priorOlder) {
      if (allIds.includes(match.matchId)) known.set(match.matchId, match);
    }
    for (const match of priorCore) {
      if (coreSet.has(match.matchId)) known.set(match.matchId, match);
    }
  }
  await collectMatchDetails(coreIds.filter(id => !known.has(id)), region, puuid, known, Date.now() + 12_000, coreSet);
  const matches = coreIds.flatMap(id => known.get(id) ?? []);
  const coreComplete = rankedEntries !== undefined && matchList !== undefined && matches.length === rawCore.length &&
    (matches.length > 0 || priorCore.length === 0);

  // Mastery is optional and comes after core details so it cannot consume a
  // quota slot needed for the most recent matches. An old result retains its own date.
  const mastery = profile ? await loadChampionMastery(platform, puuid) : undefined;
  const championMastery = mastery ?? fallback?.championMastery;
  if (!coreComplete) {
    if (fallback || (!rankedEntries && !matchList && !championMastery)) {
      return unavailable([rank, ids].find(response => response.status !== 200)?.status ?? 502, mastery);
    }
    return { ok: true, source: "partial", fresh: false, retryAt: retryAt(), player: {
      puuid, platform, gameName: realName, tagLine: realTag, summonerLevel: level, profileIcon: icon,
      rankTier: solo?.tier ?? null, rankDiv: solo?.rank ?? null, rankLp: solo?.leaguePoints ?? null,
      rankWins: solo?.wins ?? null, rankLosses: solo?.losses ?? null, rankedEntries, championMastery,
      snapshot: summarize(readStoredMatches(matches, COMMUNITY_MATCH_LIMIT).filter(match => isPublicMatchQueue(match.queueId))), fetchedAt: observedAt,
    } };
  }

  if (profile && !retryAt()) {
    const deadline = Date.now() + 9_000;
    // Use one existing optional four-match batch. Prioritize the most recent
    // ranked games from a stale window, then older records without rich details.
    const staleProfile = fallback && !playerSnapshotTiming(fallback.fetchedAt).fresh;
    const rankedLegacy = staleProfile ? allIds.filter(id => {
      const prior = known.get(id);
      return prior && prior.detailsVersion !== MATCH_DETAILS_VERSION && eligibleForMatchRating(prior.queueId, prior.durationSec);
    }) : [];
    const missingDetails = allIds.filter(id => known.has(id) && !known.get(id)?.detailsVersion);
    const legacy = [...new Set([...rankedLegacy, ...missingDetails])].slice(0, 4);
    const accepting = await collectMatchDetails(legacy, region, puuid, known, deadline, coreSet);
    const missing = olderIds.filter(id => !known.has(id));
    // Coordinate large cold backfills across function instances. Ordinary
    // handfuls of new games and cached rows do not require the application lease.
    const bulkAllowed = missing.length <= 8 || (accepting && !retryAt() &&
      await claimRiotWindow("riot:profile-deep").catch(() => false));
    if (accepting && bulkAllowed) {
      await collectMatchDetails(missing, region, puuid, known, deadline, coreSet);
    }
  }

  const recentMatches = coreIds.flatMap(id => known.get(id) ?? []);
  let history: { olderMatches: MatchSummary[]; historyComplete: boolean } | undefined;
  if (profile) {
    const olderMatches = olderIds.flatMap(id => known.get(id) ?? []);
    history = { olderMatches, historyComplete: matchList?.length === allIds.length && recentMatches.length + olderMatches.length === allIds.length };
  } else if (fallback?.matchHistory && rawCore.length === COMMUNITY_MATCH_LIMIT) {
    const olderMatches = [...priorCore.filter(match => !coreSet.has(match.matchId)), ...priorOlder.filter(match => !coreSet.has(match.matchId))]
      .slice(0, PROFILE_MATCH_LIMIT - COMMUNITY_MATCH_LIMIT);
    history = { olderMatches, historyComplete: fallback.matchHistory.complete && coreIds.every((id, index) => id === priorCore[index]?.matchId) };
  }
  // Retain the bounded source rows for private duo checks and incremental reuse.
  // Denormalized fields used by social surfaces contain public observations only.
  const snapshot = { ...summarize(recentMatches.filter(match => isPublicMatchQueue(match.queueId))), matches: recentMatches };
  // Only the original first-20 window is eligible community/duo evidence.
  if (recentMatches.length && recentMatches.every(m => m.startedAt && m.teammates?.length && m.teammates.every(t => t.name && t.tag))) {
    snapshot.coverageThrough = Math.max(...recentMatches.map(m => m.playedAt));
    snapshot.coverageFrom = recentMatches.length < COMMUNITY_MATCH_LIMIT ? 0 : Math.min(...recentMatches.map(m => m.startedAt!));
  }
  if (history) history.olderMatches = readStoredMatches(history.olderMatches, PROFILE_MATCH_LIMIT - COMMUNITY_MATCH_LIMIT, recentMatches);
  const stored = { ...snapshot, rankedEntries, rankObservedAt, matchObservedAt: Date.now(), championMastery, ...history };
  const rows = await q`WITH accepted_snapshot AS (
    INSERT INTO wp_players
      (puuid, platform, game_name, tag_line, summoner_level, profile_icon,
       rank_tier, rank_div, rank_lp, rank_wins, rank_losses, snapshot, fetched_at)
    VALUES (${puuid}, ${platform}, ${realName}, ${realTag}, ${level}, ${icon},
       ${solo?.tier ?? null}, ${solo?.rank ?? null}, ${solo?.leaguePoints ?? null},
       ${solo?.wins ?? null}, ${solo?.losses ?? null}, ${JSON.stringify(stored)}::jsonb, ${observedAt})
    ON CONFLICT (puuid) DO UPDATE SET
      platform = EXCLUDED.platform, game_name = EXCLUDED.game_name, tag_line = EXCLUDED.tag_line,
      summoner_level = EXCLUDED.summoner_level, profile_icon = EXCLUDED.profile_icon,
      rank_tier = EXCLUDED.rank_tier, rank_div = EXCLUDED.rank_div, rank_lp = EXCLUDED.rank_lp,
      rank_wins = EXCLUDED.rank_wins, rank_losses = EXCLUDED.rank_losses,
      snapshot = EXCLUDED.snapshot, fetched_at = EXCLUDED.fetched_at
    WHERE wp_players.fetched_at < EXCLUDED.fetched_at
      AND COALESCE((wp_players.snapshot->>'rankObservedAt')::timestamptz, '-infinity'::timestamptz)
        <= (EXCLUDED.snapshot->>'rankObservedAt')::timestamptz
    RETURNING *
  ), recorded_rank AS (
    INSERT INTO wp_rank_history (puuid, platform, queue, observed_day, tier, division, lp, wins, losses, captured_at)
    SELECT player.puuid, player.platform, rank."queueType", (observation.captured_at AT TIME ZONE 'UTC')::date,
      rank.tier, rank.rank, rank."leaguePoints", rank.wins, rank.losses, observation.captured_at
    FROM accepted_snapshot player
    CROSS JOIN LATERAL (SELECT (player.snapshot->>'rankObservedAt')::timestamptz AS captured_at) observation
    CROSS JOIN LATERAL jsonb_to_recordset(player.snapshot->'rankedEntries')
      AS rank("queueType" text, tier text, rank text, "leaguePoints" bigint, wins bigint, losses bigint)
    ON CONFLICT (puuid, queue, observed_day) DO UPDATE SET
      platform = EXCLUDED.platform, tier = EXCLUDED.tier, division = EXCLUDED.division,
      lp = EXCLUDED.lp, wins = EXCLUDED.wins, losses = EXCLUDED.losses, captured_at = EXCLUDED.captured_at
    WHERE wp_rank_history.captured_at < EXCLUDED.captured_at
  )
  SELECT * FROM accepted_snapshot`;
  if (!rows.length) {
    const newer = await getCachedPlayer(puuid, { profile });
    return newer ? { ok: true, player: newer, fresh: false, source: "cache" } : unavailable(503);
  }
  return { ok: true, player: playerFromRow(rows[0]), fresh: true, source: "live", retryAt: retryAt() };
}

/* ---------------- Data Dragon (static game data, CDN-cached) ---------------- */

let lastPatch: string | undefined;
let patchRecheckAt = 0;
let pendingPatch: Promise<string | null> | undefined;

/** A patch used for publishing must have a successful Data Dragon version check. */
export function confirmedPatch(): Promise<string | null> {
  if (Date.now() < patchRecheckAt) return Promise.resolve(patchConfirmed ? (lastPatch ?? null) : null);
  pendingPatch ??= refreshPatch().finally(() => {
    pendingPatch = undefined;
  });
  return pendingPatch;
}
let patchConfirmed = false;
async function refreshPatch() {
  try {
    const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) throw new Error("Cannot check patch");
    const versions: unknown = await res.json();
    if (!Array.isArray(versions) || typeof versions[0] !== "string" || !/^\d+\.\d+\.\d+$/.test(versions[0]))
      throw new Error("Invalid patch version");
    lastPatch = versions[0];
    patchRecheckAt = Date.now() + 6 * 60 * 60_000;
    patchConfirmed = true;
    return lastPatch;
  } catch {
    patchRecheckAt = Date.now() + 60_000;
    patchConfirmed = false;
    return null;
  }
}

/** Recent working asset URL for rendering during a CDN outage. */
export async function currentPatch(): Promise<string> {
  return (await confirmedPatch()) ?? lastPatch ?? bundledCatalog.patch;
}

export function championIconUrl(patch: string, champion: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${champion}.png`;
}
export function profileIconUrl(patch: string, iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/profileicon/${iconId}.png`;
}

export interface ChampionInfo {
  id: string;
  key?: number;
  name: string;
  title: string;
  tags: string[];
}
type Catalog = { patch: string; list: ChampionInfo[] };
let champCache: Catalog | undefined;
let retryCatalog: { patch: string; at: number } | undefined;
let pendingList: { patch: string; task: Promise<Catalog> } | undefined;

export async function championCatalog() {
  const patch = await confirmedPatch();
  const previous = champCache ?? bundledCatalog;
  if (!patch) return { ...previous, current: false };
  if (champCache?.patch === patch) return { ...champCache, current: true };
  if (retryCatalog?.patch === patch && Date.now() < retryCatalog.at) return { ...previous, current: false };
  if (pendingList?.patch !== patch) {
    const task = readChampionList(patch).finally(() => {
      if (pendingList?.task === task) pendingList = undefined;
    });
    pendingList = { patch, task };
  }
  const catalog = await pendingList.task;
  return { ...catalog, current: catalog === champCache && catalog.patch === patch };
}
export async function championList(): Promise<ChampionInfo[]> {
  return (await championCatalog()).list;
}

async function readChampionList(patch: string): Promise<Catalog> {
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) throw new Error("Cannot load champions");
    const body = (await res.json()) as { data: Record<string, Omit<ChampionInfo, "key"> & {key?: string | number}> };
    const list = Object.values(body.data).map(({ id, name, title, tags, key }) => {
      const numericId = Number(key);
      return { id, name, title, tags, ...(Number.isSafeInteger(numericId) && numericId > 0 ? { key: numericId } : {}) };
    });
    if (!list.length) throw new Error("Empty champion roster");
    return (champCache = { patch, list });
  } catch {
    retryCatalog = { patch, at: Date.now() + 60_000 };
    return champCache ?? bundledCatalog;
  }
}

import { q, dbAvailable } from "./db";
import bundledCatalog from "./champion-catalog.json";

/**
 * Riot API access — on-demand recent form ONLY (build brief §2/§8).
 * A player's wp_players row is a short-lived cache of their last ~20 games;
 * it is overwritten on refresh and nothing older is retained anywhere.
 */

import { PLATFORMS, isPlatform, type PlatformId } from "./platforms";
export { PLATFORMS, isPlatform };
export type { PlatformId };

import { summarize, teamBaronFields, EMPTY_SNAPSHOT, type MatchSummary, type PlayerSnapshot } from "./pure";
export { summarize, EMPTY_SNAPSHOT };
export type { MatchSummary, PlayerSnapshot };

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
  snapshot: PlayerSnapshot;
  fetchedAt: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

function key(): string | null {
  return process.env.RIOT_API_KEY ?? null;
}

export function riotConfigured(): boolean {
  return Boolean(key());
}

let apiCooldownUntil = 0;

async function riotJson(url: string): Promise<{ status: number; body: unknown }> {
  const k = key();
  if (!k) return { status: 503, body: null };
  if (Date.now() < apiCooldownUntil) return { status: 429, body: null };
  try {
    const res = await fetch(url, {
      headers: { "X-Riot-Token": k },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 5;
      apiCooldownUntil = Math.max(apiCooldownUntil, Date.now() + Math.min(600, Math.max(wait, 1)) * 1000);
    }
    if (!res.ok) return { status: res.status, body: null };
    return { status: 200, body: await res.json() };
  } catch {
    return { status: 502, body: null };
  }
}

/** Recompute display totals from the bounded match sample, including older rows without champion KDA. */
function readSnapshot(raw: unknown): PlayerSnapshot {
  if (!raw || typeof raw !== "object") return EMPTY_SNAPSHOT;
  const stored = raw as Partial<PlayerSnapshot>;
  if (Array.isArray(stored.matches) && stored.matches.length) {
    const matches = stored.matches
      .slice(0, 20)
      .filter(
        (m) =>
          m &&
          typeof m.matchId === "string" &&
          typeof m.champion === "string" &&
          typeof m.win === "boolean" &&
          [m.kills, m.deaths, m.assists, m.cs, m.durationSec, m.playedAt].every(Number.isFinite),
      )
      .map((m) => ({
        ...m,
        items: Array.isArray(m.items) ? m.items.filter(Number.isInteger) : [],
        teammates: Array.isArray(m.teammates)
          ? m.teammates.filter((t) => t && typeof t.name === "string" && typeof t.champion === "string")
          : [],
      }));
    return summarize(matches);
  }
  // Older data may only contain aggregates. Preserve complete aggregates without inventing unknown values.
  if (
    [stored.games, stored.wins, stored.losses, stored.kda].every(Number.isFinite) &&
    Array.isArray(stored.champPool) &&
    stored.roles &&
    typeof stored.roles === "object"
  ) {
    return {
      ...EMPTY_SNAPSHOT,
      games: stored.games!,
      wins: stored.wins!,
      losses: stored.losses!,
      kda: stored.kda!,
      roles: stored.roles,
      champPool: stored.champPool.filter(
        (c) => c && typeof c.champion === "string" && [c.games, c.wins, c.kda].every(Number.isFinite),
      ),
    };
  }
  return EMPTY_SNAPSHOT;
}

export function playerFromRow(r: Record<string, unknown>): Player {
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
    snapshot: readSnapshot(r.snapshot),
    fetchedAt: String(r.fetched_at),
  };
}

export async function getCachedPlayer(puuid: string): Promise<Player | null> {
  if (!dbAvailable()) return null;
  const rows = await q`SELECT * FROM wp_players WHERE puuid = ${puuid} LIMIT 1`;
  return rows.length ? playerFromRow(rows[0]) : null;
}

export type LookupResult =
  | { ok: true; player: Player; fresh: boolean; source: "live" | "cache" | "stale" }
  | { ok: false; code: "not_found" | "invalid_key" | "key_unavailable" | "upstream" | "unavailable" };

const refreshes = new Map<string, Promise<LookupResult>>();

export async function lookupPlayer(platform: string, gameName: string, tagLine: string): Promise<LookupResult> {
  if (!isPlatform(platform)) return { ok: false, code: "not_found" };
  if (!dbAvailable()) return { ok: false, code: "unavailable" };
  const name = gameName.trim(),
    tag = tagLine.trim();
  if (!name || !tag || name.length > 32 || tag.length > 16) return { ok: false, code: "not_found" };
  const id = JSON.stringify([platform, name.toLowerCase(), tag.toLowerCase()]);
  const running = refreshes.get(id);
  if (running) return running;
  const task = loadPlayer(platform, name, tag).finally(() => {
    refreshes.delete(id);
  });
  refreshes.set(id, task);
  return task;
}

async function loadPlayer(platform: string, gameName: string, tagLine: string): Promise<LookupResult> {
  const existing = await q`SELECT * FROM wp_players
    WHERE platform = ${platform} AND lower(game_name) = lower(${gameName}) AND lower(tag_line) = lower(${tagLine}) ORDER BY fetched_at DESC,puuid LIMIT 1`;
  const cached = existing[0] ? playerFromRow(existing[0]) : null;
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS)
    return { ok: true, player: cached, fresh: false, source: "cache" };
  let fallback = cached;
  const unavailable = (status: number): LookupResult =>
    fallback
      ? { ok: true, player: fallback, fresh: false, source: "stale" }
      : { ok: false, code: status === 401 || status === 403 ? "invalid_key" : "upstream" };
  if (!riotConfigured()) return cached ? unavailable(503) : { ok: false, code: "key_unavailable" };
  const region = regionFor(platform);
  const acct = await riotJson(
    // Account-V1 accepts americas, asia and europe; Match-V5 additionally routes Oceania through SEA.
    `https://${region === "sea" ? "asia" : region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
  if (acct.status === 404) return { ok: false, code: "not_found" };
  if (acct.status !== 200 || !acct.body) return unavailable(acct.status);
  const {
    puuid,
    gameName: realName,
    tagLine: realTag,
  } = acct.body as Partial<{ puuid: string; gameName: string; tagLine: string }>;
  if (typeof puuid !== "string" || !puuid || typeof realName !== "string" || typeof realTag !== "string")
    return unavailable(502);

  // A reassigned Riot ID must never inherit the prior holder’s cached profile.
  if (cached && cached.puuid !== puuid) fallback = null;

  const [summ, league, ids] = await Promise.all([
    riotJson(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`),
    riotJson(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`),
    riotJson(`https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20`),
  ]);

  if (summ.status === 404) return { ok: false, code: "not_found" };
  const failed = [summ, league, ids].find((response) => response.status !== 200);
  if (failed) return unavailable(failed.status);
  if (!summ.body || !Array.isArray(ids.body) || !Array.isArray(league.body)) return unavailable(502);

  const level = summ.body ? Number((summ.body as { summonerLevel: number }).summonerLevel ?? 0) : 0;
  const icon = summ.body ? Number((summ.body as { profileIconId: number }).profileIconId ?? 0) : 0;

  let tier: string | null = null,
    div: string | null = null,
    lp: number | null = null,
    wins: number | null = null,
    losses: number | null = null;
  if (Array.isArray(league.body)) {
    const solo = league.body.find((e) => (e as { queueType: string }).queueType === "RANKED_SOLO_5x5") as
      | { tier: string; rank: string; leaguePoints: number; wins: number; losses: number }
      | undefined;
    if (solo) {
      tier = solo.tier;
      div = solo.rank;
      lp = solo.leaguePoints;
      wins = solo.wins;
      losses = solo.losses;
    }
  }

  const matchIds = Array.from(new Set(ids.body.filter((id): id is string => typeof id === "string"))).slice(
    0,
    20,
  );
  const known = new Map(
    (cached?.puuid === puuid ? cached.snapshot.matches : []).map((match) => [match.matchId, match]),
  );
  const missing = matchIds.filter((id) => !known.has(id));
  for (let i = 0; i < missing.length; i += 4) {
    const batch = missing.slice(i, i + 4);
    const results = await Promise.all(
      batch.map((id) =>
        riotJson(`https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(id)}`),
      ),
    );
    for (const r of results) {
      if (r.status === 404) continue;
      if (r.status !== 200 || !r.body) return unavailable(r.status);
      const m = r.body as {
        info: {
          gameDuration: number;
          gameVersion?: string;
          queueId: number;
          gameEndTimestamp: number;
          teams?: { teamId: number; objectives?: { baron?: { kills?: number } } }[];
          participants: {
            puuid: string;
            championName: string;
            win: boolean;
            kills: number;
            deaths: number;
            assists: number;
            totalMinionsKilled: number;
            neutralMinionsKilled: number;
            teamPosition: string;
            teamId: number;
            goldEarned: number;
            riotIdGameName?: string;
            riotIdTagline?: string;
            item0: number;
            item1: number;
            item2: number;
            item3: number;
            item4: number;
            item5: number;
            item6: number;
          }[];
        };
        metadata: { matchId: string };
      };
      if (!Array.isArray(m.info?.participants) || !batch.includes(m.metadata?.matchId)) return unavailable(502);
      const me = m.info.participants.find((p) => p.puuid === puuid);
      if (!me) continue;
      const team = m.info.participants.filter((p) => p.teamId === me.teamId);
      const teamObjectives = Number.isInteger(me.teamId) && Array.isArray(m.info.teams)
        ? m.info.teams.find(t => t?.teamId === me.teamId)?.objectives
        : undefined;
      const opposite = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"].includes(me.teamPosition)
        ? m.info.participants.filter((p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition)
        : [];
      const gamePatch = typeof m.info.gameVersion === "string"
        ? /^([1-9]\d?\.[1-9]\d?)(?:\.|$)/.exec(m.info.gameVersion)?.[1]
        : undefined;
      known.set(m.metadata.matchId, {
        matchId: m.metadata.matchId,
        champion: me.championName,
        win: me.win,
        kills: me.kills,
        deaths: me.deaths,
        assists: me.assists,
        cs: me.totalMinionsKilled + me.neutralMinionsKilled,
        durationSec: m.info.gameDuration,
        queueId: m.info.queueId,
        role: me.teamPosition || "",
        opponentChampion: opposite.length === 1 ? opposite[0].championName : undefined,
        gamePatch,
        playedAt: m.info.gameEndTimestamp,
        items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6].filter((x) => x > 0),
        gold: me.goldEarned,
        teamGold: team.reduce((a, p) => a + p.goldEarned, 0),
        ...teamBaronFields({ teamBaronKills: teamObjectives?.baron?.kills }),
        teammates: team
          .filter((p) => p.puuid !== puuid)
          .map((p) => ({
            champion: p.championName,
            name: p.riotIdGameName ?? "",
            tag: p.riotIdTagline || undefined,
          })),
      });
    }
  }

  const matches = matchIds.flatMap((id) => known.get(id) ?? []);
  if (!matches.length && (matchIds.length > 0 || (fallback?.snapshot.games ?? 0) > 0)) return unavailable(502);

  const snapshot = summarize(matches);
  const rows = await q`INSERT INTO wp_players
      (puuid, platform, game_name, tag_line, summoner_level, profile_icon,
       rank_tier, rank_div, rank_lp, rank_wins, rank_losses, snapshot, fetched_at)
    VALUES (${puuid}, ${platform}, ${realName}, ${realTag}, ${level}, ${icon},
       ${tier}, ${div}, ${lp}, ${wins}, ${losses}, ${JSON.stringify(snapshot)}::jsonb, now())
    ON CONFLICT (puuid) DO UPDATE SET
      platform = EXCLUDED.platform, game_name = EXCLUDED.game_name, tag_line = EXCLUDED.tag_line,
      summoner_level = EXCLUDED.summoner_level, profile_icon = EXCLUDED.profile_icon,
      rank_tier = EXCLUDED.rank_tier, rank_div = EXCLUDED.rank_div, rank_lp = EXCLUDED.rank_lp,
      rank_wins = EXCLUDED.rank_wins, rank_losses = EXCLUDED.rank_losses,
      snapshot = EXCLUDED.snapshot, fetched_at = now()
    RETURNING *`;
  return { ok: true, player: playerFromRow(rows[0]), fresh: true, source: "live" };
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
    const body = (await res.json()) as { data: Record<string, ChampionInfo> };
    const list = Object.values(body.data).map(({ id, name, title, tags }) => ({ id, name, title, tags }));
    if (!list.length) throw new Error("Empty champion roster");
    return (champCache = { patch, list });
  } catch {
    retryCatalog = { patch, at: Date.now() + 60_000 };
    return champCache ?? bundledCatalog;
  }
}

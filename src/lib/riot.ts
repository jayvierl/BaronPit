import { q, dbAvailable } from "./db";

/**
 * Riot API access — on-demand recent form ONLY (build brief §2/§8).
 * A player's wp_players row is a short-lived cache of their last ~20 games;
 * it is overwritten on refresh and nothing older is retained anywhere.
 */

import { PLATFORMS, isPlatform, type PlatformId } from "./platforms";
export { PLATFORMS, isPlatform };
export type { PlatformId };

import { summarize, EMPTY_SNAPSHOT, type MatchSummary, type PlayerSnapshot } from "./pure";
export { summarize, EMPTY_SNAPSHOT };
export type { MatchSummary, PlayerSnapshot };

function regionFor(platform: string): "americas" | "europe" | "asia" {
  if (["euw1", "eun1", "tr1", "ru"].includes(platform)) return "europe";
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

async function riotJson(url: string): Promise<{ status: number; body: unknown }> {
  const k = key();
  if (!k) return { status: 503, body: null };
  try {
    const res = await fetch(url, { headers: { "X-Riot-Token": k }, cache: "no-store" });
    if (!res.ok) return { status: res.status, body: null };
    return { status: 200, body: await res.json() };
  } catch {
    return { status: 502, body: null };
  }
}

/** Convert a wp_players row to a Player — exported so JOIN queries don't round-trip through getCachedPlayer (audit D5). */
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
    snapshot: (r.snapshot as PlayerSnapshot) ?? EMPTY_SNAPSHOT,
    fetchedAt: String(r.fetched_at),
  };
}

export async function getCachedPlayer(puuid: string): Promise<Player | null> {
  if (!dbAvailable()) return null;
  const rows = await q`SELECT * FROM wp_players WHERE puuid = ${puuid} LIMIT 1`;
  return rows.length ? playerFromRow(rows[0]) : null;
}

export type LookupResult =
  | { ok: true; player: Player; fresh: boolean }
  | { ok: false; code: "not_found" | "invalid_key" | "key_unavailable" | "upstream" | "unavailable" };

export async function lookupPlayer(platform: string, gameName: string, tagLine: string, _force = false): Promise<LookupResult> {
  if (!isPlatform(platform)) return { ok: false, code: "not_found" };
  if (!dbAvailable()) return { ok: false, code: "unavailable" };
  if (!riotConfigured()) return { ok: false, code: "key_unavailable" };

  const existing = await q`SELECT * FROM wp_players
    WHERE platform = ${platform} AND lower(game_name) = lower(${gameName}) AND lower(tag_line) = lower(${tagLine})
    LIMIT 1`;
  if (existing.length) {
    const p = playerFromRow(existing[0]);
    // The TTL binds even forced refreshes — a public force=1 must not be able
    // to burn the shared dev-key quota (audit D7).
    if (Date.now() - new Date(p.fetchedAt).getTime() < CACHE_TTL_MS) return { ok: true, player: p, fresh: false };
  }

  const region = regionFor(platform);
  const acct = await riotJson(
    `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
  if (acct.status === 404) return { ok: false, code: "not_found" };
  if (acct.status === 401 || acct.status === 403) return { ok: false, code: "invalid_key" };
  if (acct.status !== 200 || !acct.body) return { ok: false, code: "upstream" };
  const puuid = String((acct.body as { puuid: string }).puuid);
  const realName = String((acct.body as { gameName: string }).gameName);
  const realTag = String((acct.body as { tagLine: string }).tagLine);

  const [summ, league, ids] = await Promise.all([
    riotJson(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`),
    riotJson(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`),
    riotJson(`https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20`),
  ]);

  const level = summ.body ? Number((summ.body as { summonerLevel: number }).summonerLevel ?? 0) : 0;
  const icon = summ.body ? Number((summ.body as { profileIconId: number }).profileIconId ?? 0) : 0;

  let tier: string | null = null, div: string | null = null, lp: number | null = null, wins: number | null = null, losses: number | null = null;
  if (Array.isArray(league.body)) {
    const solo = league.body.find((e) => (e as { queueType: string }).queueType === "RANKED_SOLO_5x5") as
      | { tier: string; rank: string; leaguePoints: number; wins: number; losses: number } | undefined;
    if (solo) { tier = solo.tier; div = solo.rank; lp = solo.leaguePoints; wins = solo.wins; losses = solo.losses; }
  }

  const matchIds = Array.isArray(ids.body) ? (ids.body as string[]) : [];
  const matches: MatchSummary[] = [];
  for (let i = 0; i < matchIds.length; i += 4) {
    const batch = matchIds.slice(i, i + 4);
    const results = await Promise.all(
      batch.map((id) => riotJson(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`)),
    );
    for (const r of results) {
      if (r.status !== 200 || !r.body) continue;
      const m = r.body as {
        info: {
          gameDuration: number; queueId: number; gameEndTimestamp: number;
          participants: {
            puuid: string; championName: string; win: boolean; kills: number; deaths: number; assists: number;
            totalMinionsKilled: number; neutralMinionsKilled: number; teamPosition: string; teamId: number;
            goldEarned: number; riotIdGameName?: string;
            item0: number; item1: number; item2: number; item3: number; item4: number; item5: number; item6: number;
          }[];
          teams?: { teamId: number; objectives?: { baron?: { kills: number } } }[];
        };
        metadata: { matchId: string };
      };
      const me = m.info.participants.find((p) => p.puuid === puuid);
      if (!me) continue;
      const team = m.info.participants.filter((p) => p.teamId === me.teamId);
      matches.push({
        matchId: m.metadata.matchId,
        champion: me.championName,
        win: me.win,
        kills: me.kills, deaths: me.deaths, assists: me.assists,
        cs: me.totalMinionsKilled + me.neutralMinionsKilled,
        durationSec: m.info.gameDuration,
        queueId: m.info.queueId,
        role: me.teamPosition || "",
        playedAt: m.info.gameEndTimestamp,
        items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6].filter((x) => x > 0),
        gold: me.goldEarned,
        teamGold: team.reduce((a, p) => a + p.goldEarned, 0),
        baron: (m.info.teams?.find((t) => t.teamId === me.teamId)?.objectives?.baron?.kills ?? 0) > 0,
        teammates: team
          .filter((p) => p.puuid !== puuid)
          .map((p) => ({ champion: p.championName, name: p.riotIdGameName ?? "" })),
      });
    }
  }

  // Never overwrite a good cached snapshot with an empty/failed refresh (audit A3).
  if (matches.length === 0 && existing.length) {
    return { ok: true, player: playerFromRow(existing[0]), fresh: false };
  }

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
  return { ok: true, player: playerFromRow(rows[0]), fresh: true };
}


/* ---------------- Data Dragon (static game data, CDN-cached) ---------------- */

let patchCache: { patch: string; at: number } | null = null;
export async function currentPatch(): Promise<string> {
  if (patchCache && Date.now() - patchCache.at < 6 * 60 * 60 * 1000) return patchCache.patch;
  try {
    const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { cache: "no-store" });
    const versions = (await res.json()) as string[];
    patchCache = { patch: versions[0] ?? "16.23.1", at: Date.now() };
  } catch {
    patchCache = { patch: "16.23.1", at: Date.now() };
  }
  return patchCache.patch;
}

export function championIconUrl(patch: string, champion: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${champion}.png`;
}
export function profileIconUrl(patch: string, iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/profileicon/${iconId}.png`;
}

export interface ChampionInfo { id: string; name: string; title: string; tags: string[] }
let champCache: { at: number; list: ChampionInfo[] } | null = null;
export async function championList(): Promise<ChampionInfo[]> {
  if (champCache && Date.now() - champCache.at < 24 * 60 * 60 * 1000) return champCache.list;
  const patch = await currentPatch();
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`, { cache: "no-store" });
    const body = (await res.json()) as { data: Record<string, { id: string; name: string; title: string; tags: string[] }> };
    const list = Object.values(body.data).map((c) => ({ id: c.id, name: c.name, title: c.title, tags: c.tags }));
    champCache = { at: Date.now(), list };
    return list;
  } catch {
    return champCache?.list ?? [];
  }
}

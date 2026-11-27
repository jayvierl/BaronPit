import { cache } from "react";
import { queryRows } from "./db";
import { HIDDEN_AUTHORS, BLOCKED_AUTHORS } from "./community-queries";
import { playerFlair, readRankedEntries } from "./player-summary";
import { currentWinStreak } from "./current-win-streak";
import { playerFromRow, type Player } from "./riot";
import { fnvHash } from "./pure";
import { publicAvatar } from "./avatar";
import { publicQueueSql } from "./public-match-queues";
import { SOCIAL_PLAYER_SELECT } from "./social-player-select";

function linkedRows(userId: number, includeMatches: boolean) {
  const columns = includeMatches ? SOCIAL_PLAYER_SELECT
    : "p.puuid,p.platform,p.game_name,p.tag_line,p.profile_icon,p.rank_tier,p.rank_div,p.rank_lp,p.fetched_at,p.snapshot->'rankedEntries' AS entries";
  return queryRows(`SELECT ${columns}, l.is_primary,
    (l.verified AND NOT EXISTS (SELECT 1 FROM wp_links other WHERE other.verified AND other.puuid=l.puuid AND other.user_id<>l.user_id)) AS verified
    FROM wp_links l JOIN wp_players p ON p.puuid=l.puuid WHERE l.user_id=$1
    ORDER BY verified DESC,l.is_primary DESC,l.created_at,l.puuid`, [userId]);
}

export async function linkedPlayerIdentities(userId: number) {
  return (await linkedRows(userId, false)).map(row => ({
    puuid: String(row.puuid), platform: String(row.platform), gameName: String(row.game_name), tagLine: String(row.tag_line),
    profileIcon: Number(row.profile_icon ?? 0), primary: row.is_primary === true, verified: row.verified === true,
    rankTier: typeof row.rank_tier === "string" ? row.rank_tier : null, rankDiv: typeof row.rank_div === "string" ? row.rank_div : null,
    rankLp: row.rank_lp == null ? null : Number(row.rank_lp), rankedEntries: readRankedEntries(row.entries), fetchedAt: String(row.fetched_at),
  }));
}

export async function linkedPlayers(userId: number) {
  const rows = await linkedRows(userId, true);
  return rows.map(row => {
    const player = playerFromRow(row);
    const verified = row.verified === true;
    return { ...player, primary: row.is_primary === true, verified: row.verified === true,
      flair: verified ? playerFlair(player, player.snapshot.champPool[0]?.champion) : null,
      winStreak: verified ? currentWinStreak(row.snapshot, player.fetchedAt) : null };
  });
}

export async function publicRiotOwner(puuid: string, viewerId: number | null) {
  const [row] = await queryRows(`WITH ${HIDDEN_AUTHORS}
    SELECT u.id,u.display_name FROM wp_links l JOIN wp_users u ON u.id=l.user_id
    WHERE l.puuid=$2 AND l.verified AND u.id NOT IN (SELECT id FROM hidden)
      AND NOT EXISTS (SELECT 1 FROM wp_links other WHERE other.verified AND other.puuid=l.puuid AND other.user_id<>l.user_id)
    LIMIT 1`, [viewerId,puuid]);
  return row ? { id: Number(row.id), name: String(row.display_name) } : null;
}

type Trend = { champion: string; games: number };
let trends: { until: number; items: Promise<Trend[]> } | undefined;
export function trendingChampions(viewerId: number | null = null): Promise<Trend[]> {
  if (viewerId !== null) return readTrends(viewerId);
  if (trends && trends.until > Date.now()) return trends.items;
  const items = readTrends().catch((error) => {
    if (trends?.items === items) trends = undefined;
    throw error;
  });
  trends = { until: Date.now() + 5 * 60_000, items };
  return items;
}

// Bound the candidate snapshots before expanding JSON; count each player's
// appearance once per public match, even on a malformed/duplicated legacy row.
function publicAppearances(limit: 200 | 300) {
  return `WITH ${HIDDEN_AUTHORS}, sample AS MATERIALIZED (
    SELECT puuid, game_name, tag_line, platform, snapshot->'matches' AS matches
    FROM wp_players p WHERE snapshot <> '{}'::jsonb AND NOT EXISTS (
      SELECT 1 FROM wp_links l WHERE l.puuid=p.puuid AND l.verified AND l.user_id IN (SELECT id FROM hidden))
    ORDER BY fetched_at DESC, puuid LIMIT ${limit}
  ), appearances AS (
    SELECT DISTINCT ON (s.puuid,m->>'matchId') s.puuid,s.game_name,s.tag_line,s.platform,
      m->>'champion' AS champion,m->'win'='true'::jsonb AS win,m->>'role' AS role
    FROM sample s CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(s.matches)='array' THEN s.matches ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS records(m,pos)
    WHERE pos<=20 AND ${publicQueueSql("m")} AND m->>'matchId' ~ '^[A-Z0-9]+_[0-9]{1,20}$'
      AND m->>'champion' ~ '^[A-Za-z][A-Za-z0-9]{0,63}$' AND jsonb_typeof(m->'win')='boolean'
    ORDER BY s.puuid,m->>'matchId',pos
  )`;
}

async function readTrends(viewerId: number | null = null) {
  const rows = await queryRows(`${publicAppearances(200)}
    SELECT champion,count(*)::int AS games FROM appearances
    GROUP BY champion ORDER BY games DESC, champion LIMIT 6`,[viewerId]);
  return rows.map(row => ({champion:String(row.champion), games:Number(row.games)}));
}

export async function championRoomPulse(champion: string, viewerId: number | null = null) {
  const rows = await queryRows(`${publicAppearances(300)}, selected AS MATERIALIZED (
    SELECT * FROM appearances WHERE champion=$2
  ), played AS (
    SELECT game_name,tag_line,platform,count(*)::int AS games,count(*) FILTER(WHERE win)::int AS wins FROM selected
    GROUP BY puuid,game_name,tag_line,platform
  ), roles AS (
    SELECT role,count(*)::int AS games FROM selected
    WHERE role IN ('TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY') GROUP BY role
  ) SELECT played.*,count(*) OVER () AS players,sum(games) OVER () AS all_games,sum(wins) OVER () AS all_wins
    ,(SELECT jsonb_agg(roles ORDER BY games DESC,role) FROM roles) AS role_counts
    FROM played ORDER BY games DESC,game_name,tag_line,platform LIMIT 5`,[viewerId,champion]);
  return {
    players: Number(rows[0]?.players ?? 0),
    games: Number(rows[0]?.all_games ?? 0),
    wins: Number(rows[0]?.all_wins ?? 0),
    roles: (rows[0]?.role_counts ?? []) as { role: "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY"; games: number }[],
    topPlayers: rows.map((row) => ({
      name: String(row.game_name),
      tag: String(row.tag_line),
      platform: String(row.platform),
      games: Number(row.games),
      wins: Number(row.wins),
    })),
  };
}

/** A profile's highlight slot: rotates daily among the player's best games; never empty when they have games. */
export function dailyHighlight(player: Player, dateStr: string) {
  const games = [...player.snapshot.matches].sort(
    (a, b) => (b.kills + b.assists) / Math.max(1, b.deaths) - (a.kills + a.assists) / Math.max(1, a.deaths),
  );
  if (!games.length) return null;
  const pick = games[fnvHash(`${player.puuid}:${dateStr}`) % Math.min(games.length, 5)];
  return pick;
}

// $1 is always the viewer and $2 the UTC date. Recheck live eligibility even for a stored winner.
const visibleSpotlight = `featured AS (
  SELECT e.user_id,e.puuid FROM wp_spotlight_for_day($2::date) selected
  JOIN wp_spotlight_eligible e ON e.user_id=selected.owner_id AND e.puuid=selected.puuid
  WHERE e.user_id NOT IN (SELECT id FROM hidden)
)`;

export async function todaysSpotlight(dateStr: string, viewerId: number | null = null) {
  const [row] = await queryRows(`WITH ${HIDDEN_AUTHORS}, ${visibleSpotlight}
    SELECT ${SOCIAL_PLAYER_SELECT}, u.display_name AS owner_name, u.id AS owner_id FROM featured f
    JOIN wp_players p ON p.puuid=f.puuid JOIN wp_users u ON u.id=f.user_id`, [viewerId,dateStr]);
  if (!row) return null;
  const player = playerFromRow(row);
  if (!player.snapshot.matches.length) return null;
  return { player, ownerName: String(row.owner_name), ownerId: Number(row.owner_id), verified: true };
}

export const publicProfile = cache(async function publicProfile(userId: number, viewerId: number | null, dateStr: string) {
  const [row] = await queryRows(`WITH ${HIDDEN_AUTHORS}, ${visibleSpotlight}
    SELECT u.display_name,u.avatar_hue,u.avatar_ref,u.bio,u.profile_link,u.created_at,
      EXISTS (SELECT 1 FROM featured f WHERE f.user_id=u.id) AS featured
    FROM wp_users u WHERE u.id=$3 AND u.safety_status='visible'
      AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND u.id NOT IN (${BLOCKED_AUTHORS})`, [viewerId,dateStr,userId]);
  return row ? { id: userId, name: String(row.display_name), hue: Number(row.avatar_hue), avatar: publicAvatar(row.avatar_ref),
    bio: String(row.bio ?? ""), link: typeof row.profile_link === "string" ? row.profile_link : null, createdAt: String(row.created_at), featured: row.featured === true } : null;
});

import { q, queryRows } from "./db";
import { HIDDEN_AUTHORS, BLOCKED_AUTHORS } from "./community-queries";
import { playerFlair } from "./rank";
import { playerFromRow, type Player } from "./riot";
import { fnvHash } from "./pure";

export async function linkedPlayers(userId: number) {
  const rows = await q`SELECT p.*, l.is_primary, p.snapshot #> '{champPool,0,champion}' AS main, (l.verified AND NOT EXISTS (SELECT 1 FROM wp_links other WHERE other.verified AND other.puuid=l.puuid AND other.user_id<>l.user_id)) AS verified FROM wp_links l JOIN wp_players p ON p.puuid=l.puuid
    WHERE l.user_id=${userId} ORDER BY verified DESC,l.is_primary DESC,l.created_at,l.puuid`;
  return rows.map(row => {
    const player = playerFromRow(row);
    return { ...player, primary: row.is_primary === true, verified: row.verified === true,
      flair: row.verified === true ? playerFlair(player.rankTier, player.rankDiv, row.main) : null };
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
export function trendingChampions(): Promise<Trend[]> {
  if (trends && trends.until > Date.now()) return trends.items;
  const items = readTrends().catch((error) => {
    if (trends?.items === items) trends = undefined;
    throw error;
  });
  trends = { until: Date.now() + 5 * 60_000, items };
  return items;
}

async function readTrends() {
  const rows = await q`WITH sample AS (
    SELECT snapshot->'champPool' AS pool FROM wp_players WHERE snapshot <> '{}'::jsonb
    ORDER BY fetched_at DESC, puuid LIMIT 200
  ) SELECT c.champion, sum(c.games)::integer AS games FROM sample
    CROSS JOIN LATERAL jsonb_to_recordset(sample.pool) AS c(champion text,games integer)
    GROUP BY c.champion ORDER BY games DESC,c.champion LIMIT 6`;
  return rows.map((row) => ({ champion: String(row.champion), games: Number(row.games) }));
}

export async function championRoomPulse(champion: string) {
  const rows = await q`WITH sample AS (
    SELECT game_name, tag_line, platform, snapshot->'champPool' AS pool FROM wp_players
    WHERE snapshot <> '{}'::jsonb ORDER BY fetched_at DESC, puuid LIMIT 300
  ) SELECT s.game_name,s.tag_line,s.platform,c.games,c.wins,
    count(*) OVER () AS players,sum(c.games) OVER () AS all_games,sum(c.wins) OVER () AS all_wins
    FROM sample s CROSS JOIN LATERAL jsonb_to_recordset(s.pool) AS c(champion text,games integer,wins integer)
    WHERE c.champion=${champion} ORDER BY c.games DESC,s.game_name,s.tag_line,s.platform LIMIT 5`;
  return {
    players: Number(rows[0]?.players ?? 0),
    games: Number(rows[0]?.all_games ?? 0),
    wins: Number(rows[0]?.all_wins ?? 0),
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
    SELECT p.*, u.display_name AS owner_name, u.id AS owner_id FROM featured f
    JOIN wp_players p ON p.puuid=f.puuid JOIN wp_users u ON u.id=f.user_id`, [viewerId,dateStr]);
  if (!row) return null;
  const player = playerFromRow(row);
  if (!player.snapshot.matches.length) return null;
  return { player, ownerName: String(row.owner_name), ownerId: Number(row.owner_id), verified: true };
}

export async function publicProfile(userId: number, viewerId: number | null, dateStr: string) {
  const [row] = await queryRows(`WITH ${HIDDEN_AUTHORS}, ${visibleSpotlight}
    SELECT u.display_name,u.avatar_hue,u.bio,u.created_at,
      EXISTS (SELECT 1 FROM featured f WHERE f.user_id=u.id) AS featured
    FROM wp_users u WHERE u.id=$3 AND u.safety_status='visible'
      AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND u.id NOT IN (${BLOCKED_AUTHORS})`, [viewerId,dateStr,userId]);
  return row ? { id: userId, name: String(row.display_name), hue: Number(row.avatar_hue),
    bio: String(row.bio ?? ""), createdAt: String(row.created_at), featured: row.featured === true } : null;
}

import { queryRows } from "./db";
import { HIDDEN_AUTHORS } from "./community-queries";
import { publicQueueSql } from "./public-match-queues";
import type { PoolGame } from "./performance-index";

/**
 * Baseline pool for the Performance Index: per-game dimension scalars sampled
 * from other players' stored snapshots, newest snapshots first. Mirrors the
 * public sampling rules used for trending champions (public queues only,
 * hidden owners excluded, each player's appearance counted once per match).
 * Anonymous reads are cached for five minutes, like trendingChampions.
 */

const SAMPLE_PLAYERS = 200;
const MAX_POOL_GAMES = 4000;

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readPool(viewerId: number | null): Promise<PoolGame[]> {
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}, sample AS MATERIALIZED (
      SELECT puuid, snapshot->'matches' AS matches
      FROM wp_players p WHERE snapshot <> '{}'::jsonb AND NOT EXISTS (
        SELECT 1 FROM wp_links l WHERE l.puuid=p.puuid AND l.verified AND l.user_id IN (SELECT id FROM hidden))
      ORDER BY fetched_at DESC, puuid LIMIT ${SAMPLE_PLAYERS}
    ), games AS (
      SELECT DISTINCT ON (s.puuid, m->>'matchId') s.puuid AS player_key, m->>'role' AS role,
        CASE WHEN (m->>'durationSec') ~ '^[0-9]{1,10}$' AND (m->>'durationSec')::bigint > 0 AND (m->>'cs') ~ '^[0-9]{1,10}$'
          THEN (m->>'cs')::float8 * 60 / (m->>'durationSec')::float8 END AS cs_per_min,
        CASE WHEN jsonb_typeof(m->'killParticipation') = 'number'
          THEN (m->>'killParticipation')::float8 END AS kill_participation,
        CASE WHEN (m->>'kills') ~ '^[0-9]{1,10}$' AND (m->>'deaths') ~ '^[0-9]{1,10}$' AND (m->>'assists') ~ '^[0-9]{1,10}$'
          THEN ((m->>'kills')::float8 + (m->>'assists')::float8) / GREATEST((m->>'deaths')::float8, 1) END AS kda,
        CASE WHEN (m->>'durationSec') ~ '^[0-9]{1,10}$' AND (m->>'durationSec')::bigint > 0 AND (m->>'vision') ~ '^[0-9]{1,10}$'
          THEN (m->>'vision')::float8 * 60 / (m->>'durationSec')::float8 END AS vision_per_min,
        CASE WHEN jsonb_typeof(m->'performanceRating') = 'number'
          THEN (m->>'performanceRating')::float8 END AS rating
      FROM sample s CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.matches)='array' THEN s.matches ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS records(m, pos)
      WHERE pos <= 20 AND ${publicQueueSql("m")} AND m->>'matchId' ~ '^[A-Z0-9]+_[0-9]{1,20}$'
      ORDER BY s.puuid, m->>'matchId', pos
    )
    SELECT * FROM games LIMIT ${MAX_POOL_GAMES}`, [viewerId]);
  return rows.map(row => ({
    playerKey: String(row.player_key),
    role: typeof row.role === "string" ? row.role : "",
    csPerMin: numberOrNull(row.cs_per_min),
    killParticipation: numberOrNull(row.kill_participation),
    kda: numberOrNull(row.kda),
    visionPerMin: numberOrNull(row.vision_per_min),
    rating: numberOrNull(row.rating),
  }));
}

let cached: { until: number; items: Promise<PoolGame[]> } | undefined;
export function performancePool(viewerId: number | null = null): Promise<PoolGame[]> {
  if (viewerId !== null) return readPool(viewerId);
  if (cached && cached.until > Date.now()) return cached.items;
  const items = readPool(null).catch(error => {
    if (cached?.items === items) cached = undefined;
    throw error;
  });
  cached = { until: Date.now() + 5 * 60_000, items };
  return items;
}

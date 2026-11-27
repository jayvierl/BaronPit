import { publicQueueSql } from "./public-match-queues";
import { HIDDEN_AUTHORS } from "./community-queries";
import { queryRows } from "./db";
import { matchObservedMs } from "./match-observation";

const day = 86_400_000;

export async function tonightInThePit(viewerId: number | null, now: number) {
  const todayStart = Math.floor(now / day) * day;
  const weekStart = now - 7 * day;
  const [row] = await queryRows(`WITH ${HIDDEN_AUTHORS}, sample AS MATERIALIZED (
    SELECT p.puuid, p.snapshot->'matches' AS matches,
      ${matchObservedMs("p.snapshot", "p.fetched_at", "to_timestamp($3::double precision / 1000)")} AS fetched_ms
    FROM wp_players p WHERE p.fetched_at BETWEEN to_timestamp($2::double precision / 1000) AND to_timestamp($3::double precision / 1000)
      AND NOT EXISTS (SELECT 1 FROM wp_links l WHERE l.puuid=p.puuid AND l.user_id IN (SELECT id FROM hidden))
  ), raw AS (
    SELECT sample.puuid, match->>'matchId' AS match_id, match->>'champion' AS champion, match->'win'='true'::jsonb AS win,
      CASE WHEN jsonb_typeof(match->'playedAt')='number' THEN (match->>'playedAt')::numeric END AS played_ms, sample.fetched_ms
    FROM sample CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(sample.matches)='array' THEN sample.matches ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS games(match,pos)
    WHERE pos<=20 AND ${publicQueueSql("match")} AND match->>'matchId' ~ '^[A-Za-z0-9]+_[0-9]{1,20}$'
      AND match->>'champion' ~ '^[A-Za-z][A-Za-z0-9]{0,63}$' AND jsonb_typeof(match->'win')='boolean'
  ), observations AS (
    SELECT puuid, match_id, min(played_ms) AS played_ms, min(champion) AS champion, bool_or(win) AS win FROM raw
    WHERE played_ms <= fetched_ms AND played_ms = trunc(played_ms)
    GROUP BY puuid,match_id
    HAVING min(played_ms)=max(played_ms) AND min(champion)=max(champion) AND bool_or(win)=bool_and(win)
  ), checked_times AS (
    SELECT observations.*, min(played_ms) OVER game = max(played_ms) OVER game AS consistent
    FROM observations WINDOW game AS (PARTITION BY match_id)
  ), recent AS (
    SELECT * FROM checked_times WHERE consistent AND played_ms >= $2::numeric
  ), chosen_period AS (
    SELECT count(DISTINCT match_id) FILTER (WHERE played_ms >= $4::numeric) >= 10 AS today FROM recent
  ), selected AS (
    SELECT * FROM recent WHERE NOT (SELECT today FROM chosen_period) OR played_ms >= $4::numeric
  ), champion AS (
    SELECT champion, count(*)::int AS appearances, count(*) FILTER (WHERE win)::int AS champion_wins FROM selected
    GROUP BY champion ORDER BY appearances DESC, champion LIMIT 1
  ), totals AS (
    SELECT count(DISTINCT match_id)::int AS matches, count(*) FILTER (WHERE win)::int AS wins,
      count(*) FILTER (WHERE NOT win)::int AS losses FROM selected
  )
  SELECT chosen_period.today, totals.*, champion.* FROM chosen_period CROSS JOIN totals LEFT JOIN champion ON TRUE`,
    [viewerId, weekStart, now, todayStart]);

  const appearances = Number(row?.appearances ?? 0);
  return {
    isToday: row?.today === true,
    startsAt: row?.today === true ? todayStart : weekStart,
    matches: Number(row?.matches ?? 0), wins: Number(row?.wins ?? 0), losses: Number(row?.losses ?? 0),
    champion: appearances > 0 && typeof row?.champion === "string" ? {
      id: row.champion, appearances, winRate: Math.round(100 * Number(row.champion_wins) / appearances),
    } : null,
  };
}

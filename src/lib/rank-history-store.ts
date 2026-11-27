import { q } from "./db";
import { isPlatform } from "./platforms";
import { leagueTier } from "./rank";
import {
  RANKED_SERVER_TIME_ZONES, RANKED_YEARS, RANK_HISTORY_LIMIT, RANK_HISTORY_QUEUES,
  type QueueRankHistory, type RankHistoryPoint, type RankHistoryQueue,
} from "./rank-history";

const queues = Object.keys(RANK_HISTORY_QUEUES) as RankHistoryQueue[];

export async function readPlayerRankHistory(puuid: string, platform: string): Promise<QueueRankHistory[]> {
  if (!isPlatform(platform)) return [];
  const zone = RANKED_SERVER_TIME_ZONES[platform];
  const rows = await q`WITH player AS (
    SELECT ${puuid}::text AS puuid, ${platform}::text AS platform, ${zone}::text AS time_zone
  ), queues AS (
    SELECT unnest(${queues}::text[]) AS queue
  ), calendar AS (
    SELECT y.year,
      y.opens_at AT TIME ZONE player.time_zone AS opens_at,
      y.closes_at AT TIME ZONE player.time_zone AS closes_at,
      y.apex_closes_at AT TIME ZONE player.time_zone AS apex_closes_at
    FROM player CROSS JOIN jsonb_to_recordset(${JSON.stringify(RANKED_YEARS)}::jsonb)
      AS y(year integer, opens_at timestamp, closes_at timestamp, apex_closes_at timestamp)
  ), recent AS (
    SELECT r.*, calendar.year
    FROM player CROSS JOIN queues
    CROSS JOIN LATERAL (
      SELECT h.queue, h.observed_day, h.captured_at, h.tier, h.division, h.lp, h.wins, h.losses
      FROM wp_rank_history h
      WHERE h.puuid = player.puuid AND h.platform = player.platform AND h.queue = queues.queue
      ORDER BY h.observed_day DESC LIMIT ${RANK_HISTORY_LIMIT}
    ) r
    LEFT JOIN calendar ON r.captured_at >= calendar.opens_at AND r.captured_at <
      CASE WHEN r.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER') THEN calendar.apex_closes_at ELSE calendar.closes_at END
  ), year_markers AS (
    SELECT r.*, calendar.year
    FROM player CROSS JOIN queues CROSS JOIN calendar
    CROSS JOIN LATERAL (
      SELECT h.queue, h.observed_day, h.captured_at, h.tier, h.division, h.lp, h.wins, h.losses
      FROM wp_rank_history h
      WHERE h.puuid = player.puuid AND h.platform = player.platform AND h.queue = queues.queue
        AND h.observed_day BETWEEN (calendar.opens_at AT TIME ZONE 'UTC')::date AND (calendar.closes_at AT TIME ZONE 'UTC')::date
        AND h.captured_at >= calendar.opens_at AND h.captured_at <
          CASE WHEN h.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER') THEN calendar.apex_closes_at ELSE calendar.closes_at END
      ORDER BY h.observed_day DESC LIMIT 1
    ) r
  )
  SELECT queue, observed_day::text AS day, tier, division, lp, wins, losses, year, false AS marker FROM recent
  UNION ALL
  SELECT queue, observed_day::text AS day, tier, division, lp, wins, losses, year, true AS marker FROM year_markers
  ORDER BY day ASC`;

  return queues.map(queue => {
    const recent: RankHistoryPoint[] = [];
    const markers: RankHistoryPoint[] = [];
    for (const row of rows) {
      if (row.queue !== queue) continue;
      const tier = leagueTier(row.tier);
      if (!tier) continue;
      const point = {
        day: String(row.day), year: row.year == null ? null : Number(row.year),
        tier, division: String(row.division), lp: Number(row.lp), wins: Number(row.wins), losses: Number(row.losses),
      };
      (row.marker === true ? markers : recent).push(point);
    }
    // A newer year must have an observation for this exact shard and queue.
    // The newest marked year is current evidence, so leave it out of the table.
    return { queue, recent, previousYears: markers.slice(0, -1).reverse() };
  });
}

import { publicQueueSql } from "./public-match-queues";

/** Perspectives share posting mechanics without joining answer workflows. Alias: p. */
export const questionDecisionPost = `NOT (p.kind='card' AND p.card_validated AND
  coalesce(p.data#>>'{matchContext,discussionKind}','')='perspective')`;

/** Existing cards without the public context are reconstructed from a known queue. */
export const postDataProjection = `CASE
  WHEN p.kind<>'card' THEN p.data
  WHEN p.card_validated AND p.data ? 'matchContext' AND ${publicQueueSql("(p.data->'matchContext')")} THEN p.data
  ELSE coalesce((
    SELECT jsonb_build_object('platform',pl.platform,'riotId',pl.game_name || '#' || pl.tag_line,
      'matchId',m->>'matchId','match',jsonb_build_object('champion',m->'champion','win',m->'win',
        'kills',m->'kills','deaths',m->'deaths','assists',m->'assists','cs',m->'cs','items',m->'items','queueId',m->'queueId',
        'teamBaronKills',m->'teamBaronKills','baron',m->'baron'))
    FROM wp_players pl CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(pl.snapshot->'matches')='array' THEN pl.snapshot->'matches' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS recent(m,position)
    WHERE pl.puuid=p.data->>'puuid' AND m->>'matchId'=p.data->>'matchId' AND position<=20 AND ${publicQueueSql("m")}
    LIMIT 1
  ),'{}'::jsonb) END`;

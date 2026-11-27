import { publicQueueSql } from "./public-match-queues";

// Use for wp_players aliased as p. Player lookup reads the enriched snapshot separately.
export const SOCIAL_PLAYER_SELECT = `p.puuid, p.platform, p.game_name, p.tag_line,
  p.summoner_level, p.profile_icon, p.rank_tier, p.rank_div, p.rank_lp, p.rank_wins, p.rank_losses, p.fetched_at,
  CASE WHEN jsonb_typeof(p.snapshot) = 'object' THEN
    jsonb_set(p.snapshot - ARRAY['olderMatches','historyComplete','championMastery'], '{matches}',
      CASE WHEN jsonb_typeof(p.snapshot->'matches') = 'array' THEN coalesce((
        SELECT jsonb_agg(CASE WHEN jsonb_typeof(m) = 'object' THEN
          m - ARRAY['teams','teamKills','killParticipation','championLevel','spellIds','runes','detailsVersion','performanceRating'] ELSE m END ORDER BY pos)
        FROM jsonb_array_elements(p.snapshot->'matches') WITH ORDINALITY AS games(m,pos) WHERE pos <= 20 AND ${publicQueueSql("m")}
      ), '[]'::jsonb) ELSE coalesce(p.snapshot->'matches', 'null'::jsonb) END, false)
    ELSE '{}'::jsonb END AS snapshot`;

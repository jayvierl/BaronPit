// Both Riot snapshots must identify the same recent game, on the same team, after acceptance.
// A confirmed choice remembers only that this check passed as the recent snapshots rotate.
export const sharedGame = `EXISTS (
  SELECT 1 FROM jsonb_array_elements(sender.snapshot->'matches') sm
  JOIN jsonb_array_elements(owner.snapshot->'matches') om ON om->>'matchId'=sm->>'matchId'
  WHERE sm->>'matchId' IS NOT NULL AND sm->>'matchId' <> ''
    AND CASE WHEN sm->>'playedAt' ~ '^[0-9]{1,14}$' THEN (sm->>'playedAt')::bigint END
        >= extract(epoch FROM r.accepted_at)*1000
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(sm->'teammates')='array'
      THEN sm->'teammates' ELSE '[]'::jsonb END) teammate
      WHERE teammate->>'name'=owner.game_name AND teammate->>'tag'=owner.tag_line)
)`;

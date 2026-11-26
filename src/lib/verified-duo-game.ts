// Both snapshots must identify each other on the same team, with visible Riot IDs.
// SQL aliases sender, owner and r are bound by the caller. No matching on a hidden identity.
const matchArray = (field: string) =>
  `jsonb_array_elements(CASE WHEN jsonb_typeof(${field})='array' THEN ${field} ELSE '[]'::jsonb END)`;

function visibleTeammate(match: string, peer: string) {
  return `EXISTS(SELECT 1 FROM ${matchArray(match + "->'teammates'")} t
    WHERE t->>'name'=NULLIF(${peer}.game_name,'') AND t->>'tag'=NULLIF(${peer}.tag_line,''))`;
}

export const sharedStarts = `SELECT DISTINCT start.at AS started
  FROM ${matchArray("sender.snapshot->'matches'")} sm
  JOIN ${matchArray("owner.snapshot->'matches'")} om ON om->>'matchId'=sm->>'matchId'
  CROSS JOIN LATERAL (SELECT CASE WHEN sm->>'startedAt' ~ '^[1-9][0-9]{0,12}$'
    THEN to_timestamp((sm->>'startedAt')::bigint/1000.0) END AS at) start
  WHERE NULLIF(sm->>'matchId','') IS NOT NULL AND sm->>'startedAt'=om->>'startedAt'
    AND start.at>r.accepted_at AND start.at<=now()
    AND ${visibleTeammate("sm","owner")} AND ${visibleTeammate("om","sender")}`;

export const sharedGame = `(EXISTS (${sharedStarts}) OR EXISTS (
  SELECT 1 FROM wp_duo_game_checks saved WHERE saved.request_id=r.id
    AND saved.expires_at>now() AND saved.first_game_at>r.accepted_at))`;

// A cancelled booking only keeps results that had already been confirmed and stored.
export const confirmedBeforeCancellation = `(EXISTS (
  SELECT 1 FROM wp_duo_game_checks saved WHERE saved.request_id=r.id
    AND saved.expires_at>now() AND saved.checked_at<=r.cancelled_at
    AND saved.first_game_at>r.accepted_at AND saved.first_game_at<=r.cancelled_at))`;

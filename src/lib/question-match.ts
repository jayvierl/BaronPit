import { HIDDEN_AUTHORS } from "./community-queries";
import { dbAvailable, queryRows } from "./db";
import { parseMatchSelection, projectMatchContext, type MatchContext, type MatchSelection } from "./match-context";
import { matchObservedMs } from "./match-observation";
import { publicPatch } from "./patch-notes";
import { splitRiotId } from "./platforms";
import { teamBaronFields, type MatchSummary } from "./pure";

// A completed game result is immutable. Allow time to draft and use email
// sign-in, while requiring that Riot refreshed the bounded source within a day.
const MATCH_SOURCE_MAX_AGE_MS = 24 * 60 * 60_000;

export type QuestionMatchPreview = MatchContext & { items: number[] };
export type ResolvedQuestionMatch = { sourcePuuid: string; preview: QuestionMatchPreview; baron: ReturnType<typeof teamBaronFields> };

export async function resolveQuestionMatch(input: Record<string, unknown>, viewerId: number | null): Promise<ResolvedQuestionMatch | null> {
  const selection = parseMatchSelection(input);
  if (!selection || !dbAvailable()) return null;
  const publicId = "platform" in selection ? splitRiotId(selection.riotId, selection.platform) : null;
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}, candidates AS MATERIALIZED (
    SELECT puuid,platform,game_name,tag_line,fetched_at,snapshot FROM wp_players
    WHERE (puuid=$2 OR ($2::text IS NULL AND platform=$3 AND lower(game_name)=lower($4) AND lower(tag_line)=lower($5)))
    LIMIT 2
  ), source AS (
    SELECT c.* FROM candidates c WHERE (SELECT count(*) FROM candidates)=1
      AND c.fetched_at<=now() AND c.fetched_at>now()-($7::bigint * interval '1 millisecond')
      AND NOT EXISTS (SELECT 1 FROM wp_links l WHERE l.puuid=c.puuid AND l.verified AND l.user_id IN (SELECT id FROM hidden))
  ) SELECT s.puuid,s.platform,s.game_name,s.tag_line,${matchObservedMs("s.snapshot", "s.fetched_at")} AS observed_ms,m.game,
    EXISTS(SELECT 1 FROM wp_links l WHERE l.puuid=s.puuid AND l.verified AND l.user_id=$1
      AND NOT EXISTS(SELECT 1 FROM wp_links other WHERE other.puuid=s.puuid AND other.verified AND other.user_id<>l.user_id)) AS own_game
  FROM source s CROSS JOIN LATERAL jsonb_array_elements(
    (CASE WHEN jsonb_typeof(s.snapshot->'matches')='array' THEN s.snapshot->'matches' ELSE '[]'::jsonb END) ||
    (CASE WHEN jsonb_typeof(s.snapshot->'olderMatches')='array' THEN s.snapshot->'olderMatches' ELSE '[]'::jsonb END)
  ) WITH ORDINALITY AS m(game,position)
  WHERE m.position<=100 AND m.game->>'matchId'=$6 LIMIT 2`,
  [viewerId, "puuid" in selection ? selection.puuid : null, "platform" in selection ? selection.platform : null,
    publicId?.gameName ?? null, publicId?.tagLine ?? null, selection.matchId, MATCH_SOURCE_MAX_AGE_MS]);
  if (rows.length !== 1) return null;
  const row = rows[0];
  const match = row.game as Partial<MatchSummary> | null;
  if (!match) return null;
  const observed = new Date(Number(row.observed_ms));
  if (!Number.isFinite(observed.getTime())) return null;
  const sourceUpdatedAt = observed.toISOString();
  const preview = projectMatchContext({ ...match, opponent: match.opponentChampion, patch: publicPatch(match.gamePatch),
    platform: row.platform, riotId: `${row.game_name}#${row.tag_line}`, sourceUpdatedAt,
    authorRole: row.own_game === true ? "player" : "spectator" });
  if (!preview) return null;
  const items = Array.isArray(match.items) ? match.items.filter(id => Number.isSafeInteger(id) && id > 0).slice(0, 7) : [];
  return { sourcePuuid: String(row.puuid), preview: { ...preview, items }, baron: teamBaronFields(match) };
}

export async function readQuestionMatch(selection: MatchSelection | Record<string, unknown>, viewerId: number | null) {
  return (await resolveQuestionMatch(selection, viewerId))?.preview ?? null;
}

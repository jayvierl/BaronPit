import { queryRows } from "./db";
import { mentionKey } from "./player-mentions";
import { HIDDEN_AUTHORS } from "./community-queries";
import { isPlatform, PLATFORMS, type PlatformId } from "./platforms";

export type SearchSuggestion =
  | { kind: "player"; riotId: string; platform: PlatformId; mentionKey?: string }
  | { kind: "person"; id: number; name: string };

export type SuggestionScope = "all" | "players" | "people" | "mentions";

// '!' is the explicit LIKE escape character in both prefix queries.
function prefixPattern(input: string) {
  return input.replace(/[!%_]/g, "!$&") + "%";
}

export function canSuggestNames(term: string, scope: SuggestionScope = "all") {
  return term.length <= 80 && (scope === "mentions" && !term.includes("#") || Array.from(term.trim().split("#", 1)[0].trim()).length >= 2) &&
    !Array.from(term).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    term.indexOf("#") === term.lastIndexOf("#");
}

export async function searchNameSuggestions(term: string, scope: SuggestionScope, viewerId: number | null,
  region?: PlatformId): Promise<SearchSuggestion[]> {
  if (!canSuggestNames(term, scope)) return [];
  const [name, tag] = term.trim().split("#").map(part => part.trim());
  const pattern = prefixPattern(name);
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}, players AS (
      SELECT DISTINCT ON (lower(p.game_name), lower(p.tag_line), p.platform)
        p.puuid, p.platform, p.game_name, p.tag_line
      FROM wp_players p
      WHERE $5::text <> 'people' AND lower(p.game_name) LIKE lower($3) ESCAPE '!'
        AND ($4::text IS NULL OR (lower(p.game_name) = lower($2) AND lower(p.tag_line) LIKE lower($4) ESCAPE '!'))
        AND p.platform = ANY($6::text[]) AND p.tag_line <> ''
      ORDER BY lower(p.game_name), lower(p.tag_line), p.platform, p.fetched_at DESC, p.puuid
    ), candidates AS (
      SELECT 'player' AS kind, p.game_name AS name, p.tag_line, p.platform, NULL::int AS person_id,p.puuid
      FROM players p WHERE NOT EXISTS (
        SELECT 1 FROM wp_links l WHERE l.puuid=p.puuid AND l.verified AND l.user_id IN (SELECT id FROM hidden)
      )
      UNION ALL
      SELECT 'person', u.display_name, NULL, NULL, u.id, NULL FROM wp_users u
      WHERE $5 IN ('people','all') AND $4 IS NULL AND lower(u.display_name) LIKE lower($3) ESCAPE '!'
        AND u.safety_status='visible' AND u.id NOT IN (SELECT id FROM hidden)
    )
    SELECT kind, name, tag_line, platform, person_id, CASE WHEN $5='mentions' THEN puuid END AS mention_puuid FROM candidates
    ORDER BY (lower(name) = lower($2)) DESC, (lower(tag_line) = lower($7)) DESC NULLS LAST,
      lower(name), (kind='player') DESC, lower(tag_line), platform, person_id
    LIMIT 6`, [viewerId, name, pattern, tag === undefined ? null : prefixPattern(tag), scope,
      region ? [region] : PLATFORMS.map(platform => platform.id), tag ?? null]);
  const suggestions: SearchSuggestion[] = [];
  for (const row of rows) {
    if (row.kind === "person") suggestions.push({ kind: "person", id: Number(row.person_id), name: String(row.name) });
    else if (typeof row.platform === "string" && isPlatform(row.platform)) {
      suggestions.push({ kind: "player", riotId: `${row.name}#${row.tag_line}`, platform: row.platform,
        ...(typeof row.mention_puuid === "string" && {mentionKey:mentionKey(row.mention_puuid)}) });
    }
  }
  return suggestions;
}

import { createHash } from "node:crypto";
import { HIDDEN_AUTHORS } from "./community-queries";
import { queryRows } from "./db";
import { parseBodySegments } from "./game-tags";
import type { PlatformId } from "./platforms";

export type MentionTarget = { platform: PlatformId; game_name: string; tag_line: string; key: string };

// The public token pins one cached identity without publishing its Riot PUUID.
export function mentionKey(puuid: string) {
  return createHash("sha256").update(puuid).digest("hex").slice(0, 32);
}

export const unavailableMention = "A tagged player is unavailable. Remove that tag or choose a player from the suggestions.";

export function readMentionBody(body: string) {
  const targets: MentionTarget[] = [];
  let text = "";
  let contactText = "";
  if (!body.includes("[[")) return { ok: true as const, targets, text: body, contactText: body };
  for (const segment of parseBodySegments(body)) {
    if (segment.type === "text") {
      if (segment.text.includes("[[p:")) return { ok: false as const, error: unavailableMention };
      text += segment.text;
      contactText += segment.text;
      continue;
    }
    const { tag } = segment;
    text += tag.name;
    if (tag.kind !== "player") {
      contactText += tag.name;
      continue;
    }
    const [game_name, tag_line] = tag.name.slice(1).split("#");
    // The native @ and # delimiters are not off-site contact handles. Keep
    // the actual identity text in both the abuse and contact-info screens.
    contactText += game_name + " " + tag_line;
    if (!targets.some(t => t.platform === tag.id && t.game_name === game_name && t.tag_line === tag_line && t.key === tag.key)) {
      targets.push({ platform: tag.id, game_name, tag_line, key: tag.key });
    }
    if (targets.length > 5) return { ok: false as const, error: "Tag up to five players in one post or reply." };
  }
  return { ok: true as const, targets, text, contactText };
}

// Every caller supplies HIDDEN_AUTHORS for the current viewer as $1. Check
// the latest matching identity before applying owner visibility, just as the
// suggestions endpoint does, so a stale duplicate cannot bypass a block.
export function allMentionsVisible(parameter: string) {
  return `NOT EXISTS (
    SELECT 1 FROM jsonb_to_recordset(${parameter}::jsonb) AS t(platform text,game_name text,tag_line text,key text)
    LEFT JOIN LATERAL (
      SELECT p.puuid,p.game_name,p.tag_line FROM wp_players p WHERE p.platform=t.platform
        AND lower(p.game_name)=lower(t.game_name) AND lower(p.tag_line)=lower(t.tag_line)
      ORDER BY p.fetched_at DESC,p.puuid LIMIT 1
    ) current_player ON true
    WHERE current_player.puuid IS NULL OR current_player.game_name<>t.game_name OR current_player.tag_line<>t.tag_line
      OR left(encode(sha256(convert_to(current_player.puuid,'UTF8')), 'hex'),32)<>t.key
      OR EXISTS (SELECT 1 FROM wp_links l WHERE l.puuid=current_player.puuid AND l.verified AND l.user_id IN (SELECT id FROM hidden))
  )`;
}

export async function canOpenPlayerMention(viewer: number | null, platform: PlatformId, name: string, tag: string, key: string | undefined) {
  if (!key || !/^[0-9a-f]{32}$/.test(key)) return false;
  const [row] = await queryRows(`WITH ${HIDDEN_AUTHORS} SELECT ${allMentionsVisible("$2")} AS permitted`,
    [viewer, JSON.stringify([{ platform, game_name:name, tag_line:tag, key }])]);
  return row?.permitted === true;
}

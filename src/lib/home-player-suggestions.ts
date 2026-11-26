import "server-only";
import { TERMS_VERSION } from "./account-policy";
import { publicAvatar } from "./avatar";
import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { queryRows } from "./db";
import { PATCH_PUBLISHER } from "./patch-notes";

export async function homePlayerSuggestions(viewerId: number | null) {
  // Reuse the feed's visibility rules and only rank a bounded window of recent posts.
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}, recent AS MATERIALIZED (
    SELECT p.id,p.author_id,p.created_at FROM wp_posts p JOIN wp_users u ON u.id=p.author_id
    WHERE ${visiblePostForInteraction} AND p.created_at BETWEEN now()-interval '14 days' AND now()
      AND p.kind IN ('text','build','poll','card','clip') AND NOT (p.data @> '{"briefing":true}'::jsonb)
      AND u.id IS DISTINCT FROM $1 AND u.email<>$2 AND u.age_band='adult'
      AND u.terms_version=$3 AND u.terms_accepted_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM wp_follows f WHERE f.follower_id=$1 AND f.followee_id=u.id)
      AND NOT EXISTS(SELECT 1 FROM wp_mutes m WHERE m.muter_id=u.id AND m.muted_id=$1)
    ORDER BY p.created_at DESC,p.id DESC LIMIT 60
  ), authors AS (
    SELECT DISTINCT ON (author_id) author_id,id,created_at FROM recent
    ORDER BY author_id,created_at DESC,id DESC
  ) SELECT u.id,u.display_name,u.avatar_hue,u.avatar_ref,a.id AS post_id
    FROM authors a JOIN wp_users u ON u.id=a.author_id
    ORDER BY a.created_at DESC,a.id DESC LIMIT 3`, [viewerId, PATCH_PUBLISHER, TERMS_VERSION]);
  return rows.map((row) => ({
    id: Number(row.id), name: String(row.display_name), hue: Number(row.avatar_hue),
    avatar: publicAvatar(row.avatar_ref), postId: Number(row.post_id),
  }));
}

import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { queryRows } from "./db";
import { PATCH_PUBLISHER } from "./patch-notes";

// System bulletins already have their own room and global distribution.
export const repostableContent = (publisher: "$3" | "$11") => `p.kind IN ('text','poll','build')
  AND p.author_id IS DISTINCT FROM (SELECT id FROM wp_users WHERE email=${publisher})`;

// Only a pointer is published. Re-enabling a previous repost cannot bump its date.
export async function setRepost(userId: number, postId: number, active: boolean) {
  if (!active) {
    await queryRows("UPDATE wp_reposts SET active=false WHERE user_id=$1 AND post_id=$2 AND active", [userId, postId]);
    return true;
  }
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}
    INSERT INTO wp_reposts(user_id,post_id)
    SELECT $1,p.id FROM wp_posts p WHERE p.id=$2 AND p.author_id<>$1
      AND $1 NOT IN (SELECT id FROM hidden) AND ${visiblePostForInteraction} AND ${repostableContent("$3")}
    ON CONFLICT(user_id,post_id) DO UPDATE SET active=true RETURNING post_id`, [userId, postId, PATCH_PUBLISHER]);
  return rows.length > 0;
}

// Check the original author's and sharer's relationship again while reading.
// Multiple followed people sharing the same original still produce a single card.
export function followedReposts(anchored = false) { return `, shared AS (
  SELECT DISTINCT ON (r.post_id) r.post_id,r.user_id,r.first_shared_at
  FROM wp_reposts r JOIN wp_posts source ON source.id=r.post_id
  WHERE r.active AND r.user_id IN (SELECT followee_id FROM wp_follows WHERE follower_id=$1 UNION ALL SELECT $1::int)
    ${anchored ? "AND r.first_shared_at <= $12::timestamptz" : ""}
    AND r.user_id NOT IN (SELECT id FROM hidden)
    AND NOT EXISTS (SELECT 1 FROM wp_blocks b WHERE
      (b.blocker_id,b.blocked_id) IN ((r.user_id,source.author_id),(source.author_id,r.user_id)))
    AND NOT EXISTS (SELECT 1 FROM wp_mutes m WHERE m.muter_id=r.user_id AND m.muted_id=source.author_id)
  ORDER BY r.post_id,r.first_shared_at DESC,r.user_id
 )`; }

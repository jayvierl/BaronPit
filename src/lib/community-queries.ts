import { queryRows } from "./db";

// Every query using these fragments binds the current viewer (or null) as $1.
// Keeping author exclusions inside SQL makes them apply before sorting and LIMIT.
export const BLOCKED_AUTHORS = `
  SELECT blocked_id AS id FROM wp_blocks WHERE blocker_id = $1
  UNION ALL SELECT blocker_id FROM wp_blocks WHERE blocked_id = $1`;
export const HIDDEN_AUTHORS = `hidden AS (
  ${BLOCKED_AUTHORS}
  UNION ALL SELECT muted_id FROM wp_mutes WHERE muter_id = $1
  UNION ALL SELECT id FROM wp_users WHERE safety_status <> 'visible' OR banned_until > now()
)`;

// Older uploads were copied from public storage and never received private screening.
export const visibleContentKind = "p.kind <> 'media' AND (p.kind <> 'clip' OR (p.clip_review_required IS TRUE AND p.status = 'visible'))";
export const canDisplayPost = `p.withdrawn_at IS NULL AND ${visibleContentKind} AND p.author_id NOT IN (SELECT id FROM hidden)
  AND (p.room_id IS NULL OR EXISTS (SELECT 1 FROM wp_rooms room WHERE room.id = p.room_id AND room.safety_status = 'visible'))
  AND (p.kind<>'card' OR NOT EXISTS (
    SELECT 1 FROM wp_links source_owner WHERE source_owner.puuid=p.data->>'puuid' AND source_owner.verified
      AND source_owner.user_id IN (SELECT id FROM hidden)
  ))
  AND (NOT (p.kind='text' AND p.data ? 'dailyCallPayoff') OR EXISTS (
    SELECT 1 FROM wp_daily_calls d JOIN wp_posts ballot ON ballot.id=d.post_id
    WHERE d.payoff_post_id=p.id AND ballot.status='visible' AND ballot.withdrawn_at IS NULL
      AND ballot.author_id=p.author_id AND ballot.room_id=p.room_id
  ))`;
export const visiblePostForInteraction = `p.status = 'visible' AND ${canDisplayPost}`;

const visibleComment = "c.status = 'visible' AND c.withdrawn_at IS NULL AND c.author_id NOT IN (SELECT id FROM hidden)";

// For a targeted operation walk just the ancestor chain. A reply is visible only
// if the chain reaches a visible root in the same visible post.
export function visibleCommentsFor(scope: "posts" | "comment" | "candidateReplies", posts: "parameter" | "candidates" = "parameter") {
  if (scope !== "posts") {
    const target = scope === "comment" ? "c.id = $2" : "c.id IN (SELECT id FROM candidate_replies)";
    return `ancestors AS (
      SELECT c.id AS reply_id, c.id, c.parent_id, c.post_id FROM wp_comments c JOIN wp_posts p ON p.id = c.post_id
      WHERE ${target} AND ${visibleComment} AND ${visiblePostForInteraction}
      UNION
      SELECT a.reply_id, c.id, c.parent_id, c.post_id FROM ancestors a JOIN wp_comments c ON c.id = a.parent_id AND c.post_id = a.post_id
      WHERE ${visibleComment}
    ), thread AS (SELECT reply_id AS id FROM ancestors WHERE parent_id IS NULL)`;
  }
  // Keep large candidate sets relational so PostgreSQL can estimate their size
  // and join them directly. The bounded post IDs supplied by a caller stay an array.
  const postScope = posts === "candidates" ? "c.post_id IN (SELECT post_id FROM candidates)" : "c.post_id = ANY($2::int[])";
  return `eligible_comments AS (
    SELECT c.id, c.post_id, c.parent_id FROM wp_comments c JOIN wp_posts p ON p.id = c.post_id
    WHERE ${postScope} AND ${visibleComment} AND ${visiblePostForInteraction}
  ), thread AS (
    SELECT c.id, c.post_id FROM eligible_comments c WHERE c.parent_id IS NULL
    UNION ALL
    SELECT c.id, c.post_id FROM eligible_comments c JOIN thread t ON t.id = c.parent_id AND t.post_id = c.post_id
  )`;
}

/** A reporter may act on a currently public object they can actually see. */
export async function viewerCanSeePostOrComment(viewerId: number, kind: "post" | "comment", id: number) {
  const sql = kind === "post"
    ? `WITH ${HIDDEN_AUTHORS} SELECT 1 FROM wp_posts p WHERE p.id = $2 AND ${visiblePostForInteraction}`
    : `WITH RECURSIVE ${HIDDEN_AUTHORS}, ${visibleCommentsFor("comment")} SELECT 1 FROM thread WHERE id = $2`;
  return (await queryRows(sql, [viewerId, id])).length > 0;
}

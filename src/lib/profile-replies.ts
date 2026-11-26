import { HIDDEN_AUTHORS, visibleCommentsFor } from "./community-queries";
import { queryRows } from "./db";

const PAGE_SIZE = 20;

/** Newest first. The ancestor check excludes a reply if its room, post, or parent is hidden. */
export async function profileReplies(authorId: number, viewerId: number | null, before: string | null) {
  const rows = await queryRows(`WITH RECURSIVE ${HIDDEN_AUTHORS}
    SELECT reply.id, reply.post_id, reply.body, reply.created_at, recipient.display_name AS recipient, room.name AS room
    FROM wp_comments reply
    JOIN wp_posts p ON p.id = reply.post_id
    LEFT JOIN wp_comments parent ON parent.id = reply.parent_id AND parent.post_id = p.id
    JOIN wp_users recipient ON recipient.id = coalesce(parent.author_id, p.author_id)
    LEFT JOIN wp_rooms room ON room.id = p.room_id
    WHERE reply.author_id = $2 AND reply.status = 'visible' AND ($3::bigint IS NULL OR reply.id < $3)
      AND EXISTS (WITH RECURSIVE candidate_replies AS (SELECT reply.id), ${visibleCommentsFor("candidateReplies")}
        SELECT 1 FROM thread WHERE thread.id = reply.id)
    ORDER BY reply.id DESC LIMIT $4`, [viewerId, authorId, before, PAGE_SIZE + 1]);
  const replies = rows.slice(0, PAGE_SIZE).map(row => ({
    id: Number(row.id), postId: Number(row.post_id), body: String(row.body), createdAt: String(row.created_at),
    recipient: String(row.recipient), room: row.room == null ? null : String(row.room),
  }));
  return { replies, next: rows.length > PAGE_SIZE ? replies[PAGE_SIZE - 1].id : null };
}

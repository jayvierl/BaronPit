import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { queryRows } from "./db";
import { PATCH_PUBLISHER } from "./patch-notes";
import { repostableContent } from "./reposts";

export const quoteSourceVisible = (publisher: "$3" | "$11" | "$20") => `${visiblePostForInteraction} AND ${repostableContent(publisher)}`;

export async function quoteSourceRoom(viewerId: number, postId: number) {
  const [row] = await queryRows(`WITH ${HIDDEN_AUTHORS} SELECT p.room_id FROM wp_posts p WHERE p.id=$2
    AND $1 NOT IN (SELECT id FROM hidden) AND ${quoteSourceVisible("$3")}`, [viewerId, postId, PATCH_PUBLISHER]);
  return row ? { roomId: row.room_id == null ? null : Number(row.room_id) } : null;
}

/** The original text is read under the current viewer's audience on every render. */
export const quoteProjectionJoin = `LEFT JOIN wp_quote_posts quoted ON quoted.post_id=p.id
  LEFT JOIN LATERAL (
    SELECT original.id,original.author_id,author.display_name,original.body AS excerpt,room.name AS room_name
    FROM (
      SELECT p.id,p.author_id,p.body,p.room_id FROM wp_posts p WHERE p.id=quoted.original_post_id
        AND p.author_id=quoted.original_author_id AND ${quoteSourceVisible("$11")}
    ) original JOIN wp_users author ON author.id=original.author_id
    LEFT JOIN wp_rooms room ON room.id=original.room_id
    WHERE NOT EXISTS (SELECT 1 FROM wp_blocks b WHERE
      (b.blocker_id,b.blocked_id) IN ((p.author_id,original.author_id),(original.author_id,p.author_id)))
    AND NOT EXISTS (SELECT 1 FROM wp_mutes m WHERE m.muter_id=p.author_id AND m.muted_id=original.author_id)
  ) quote_preview ON true`;

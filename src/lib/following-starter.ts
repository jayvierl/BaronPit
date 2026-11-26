import { queryRows } from "./db";
import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { PATCH_PUBLISHER } from "./patch-notes";

/** A real conversation for an empty Following tab, selected using only visible public content. */
export async function followingStarter(userId: number) {
  const [question] = await queryRows(`WITH ${HIDDEN_AUTHORS}
    SELECT p.id,p.body,u.display_name AS author,u.id AS author_id,d.role,d.champion
    FROM wp_decisions d JOIN wp_posts p ON p.id=d.post_id JOIN wp_users u ON u.id=p.author_id
    LEFT JOIN wp_decision_preferences pref ON pref.user_id=$1
    LEFT JOIN wp_duo_fit fit ON fit.user_id=$1
    WHERE ${visiblePostForInteraction} AND p.author_id<>$1
      AND NOT EXISTS (SELECT 1 FROM wp_follows f WHERE f.follower_id=$1 AND f.followee_id=p.author_id)
      AND p.created_at >= now()-interval '14 days' AND u.email<>$2
      AND NOT EXISTS (SELECT 1 FROM wp_comments c WHERE c.post_id=p.id AND c.parent_id IS NULL
        AND c.author_id<>p.author_id AND c.status='visible' AND c.author_id NOT IN (SELECT id FROM hidden))
    ORDER BY (d.role=coalesce(pref.role,CASE WHEN fit.role='ADC' THEN 'Bot' ELSE fit.role END)) DESC NULLS LAST,
      (pref.champion=d.champion) DESC NULLS LAST,p.created_at DESC,p.id DESC
    LIMIT 1`, [userId, PATCH_PUBLISHER]);
  return question ? {id: Number(question.id), body: String(question.body), author: String(question.author),
    authorId: Number(question.author_id), role: String(question.role), champion: String(question.champion)} : null;
}

export async function activeStarterRoom(userId: number) {
  const [room] = await queryRows(`WITH ${HIDDEN_AUTHORS}
    SELECT r.id,r.slug,r.name FROM wp_posts p JOIN wp_rooms r ON r.id=p.room_id
    JOIN wp_users u ON u.id=p.author_id
    WHERE ${visiblePostForInteraction} AND p.created_at >= now()-interval '14 days'
      AND p.author_id<>$1 AND u.email<>$2
      AND NOT EXISTS (SELECT 1 FROM wp_room_members m WHERE m.user_id=$1 AND m.room_id=r.id)
    ORDER BY p.created_at DESC,p.id DESC LIMIT 1`, [userId,PATCH_PUBLISHER]);
  return room ? {id: Number(room.id), slug: String(room.slug), name: String(room.name)} : null;
}

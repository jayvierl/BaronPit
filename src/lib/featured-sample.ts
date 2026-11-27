import { questionDecisionPost } from "./match-card-projection";
import { featuredMatchup } from "./community-review";
import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { q, queryRows } from "./db";
import { validId } from "./ids";
import { pilotHostEmails } from "./pilot";

/** An explicit, once-per-enrollment sample. Only a timestamp and two flags are retained. */
export async function startFeaturedSample(userId: number, postId: number) {
  if (!validId(postId) || (await featuredMatchup(userId))?.postId !== postId) return false;
  const [row] = await q`INSERT INTO wp_pilot_feature_samples(user_id)
    SELECT m.user_id FROM wp_pilot_members m JOIN wp_users u ON u.id=m.user_id
    WHERE m.user_id=${userId} AND m.kind='participant' AND m.joined_at<=now()
      AND m.joined_at>now()-interval '28 days' AND NOT(lower(u.email)=ANY(${pilotHostEmails()}::text[]))
    ON CONFLICT(user_id) DO NOTHING RETURNING user_id`;
  return Boolean(row);
}

export async function observeFeaturedStep(userId: number, featuredId: number, openedId: number) {
  if (
    !validId(featuredId) ||
    !validId(openedId) ||
    featuredId === openedId ||
    (await featuredMatchup(userId))?.postId !== featuredId
  )
    return false;
  const result = await queryRows(
    `WITH ${HIDDEN_AUTHORS} UPDATE wp_pilot_feature_samples f SET another_thread=true,
        new_question=f.new_question OR (p.author_id=$1 AND p.created_at>f.opened_at AND d.post_id IS NOT NULL AND ${questionDecisionPost})
      FROM wp_posts p LEFT JOIN wp_decisions d ON d.post_id=p.id, wp_pilot_members m
      WHERE f.user_id=$1 AND m.user_id=f.user_id AND m.joined_at>now()-interval '28 days'
        AND f.opened_at<=now() AND f.opened_at>now()-interval '30 minutes'
        AND p.id=$2 AND ${visiblePostForInteraction}
        AND EXISTS (SELECT 1 FROM wp_users author WHERE author.id=p.author_id AND author.safety_status='visible'
                    AND (author.banned_until IS NULL OR author.banned_until<=now()))
      RETURNING f.user_id`,
    [userId, openedId],
  );
  return result.length > 0;
}
export async function featuredResults() {
  const [r] = await q`SELECT count(*)::int AS opened,count(*) FILTER(WHERE another_thread)::int AS other,
    count(*) FILTER(WHERE new_question)::int AS asked FROM wp_pilot_feature_samples f
    JOIN wp_pilot_members m ON m.user_id=f.user_id JOIN wp_users u ON u.id=m.user_id
    WHERE m.kind='participant' AND m.joined_at>now()-interval '56 days'
      AND NOT(lower(u.email)=ANY(${pilotHostEmails()}::text[]))`;
  return { opened: Number(r.opened), other: Number(r.other), asked: Number(r.asked) };
}

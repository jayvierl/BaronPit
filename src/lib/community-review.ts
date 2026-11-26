import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { q, queryRows } from "./db";
import { trialOutcomes, type TrialOutcome } from "./decisions-input";
import { pilotHostEmails } from "./pilot";
import { featureWeek, reviewHour, type ReviewRole } from "./review-hour-time";

type Host = { id: number; name: string; role: ReviewRole };
const trustedProfile = (alias: "asker" | "helper" | "u") =>
  `${alias}.safety_status='visible' AND (${alias}.banned_until IS NULL OR ${alias}.banned_until<=now())`;

export async function reviewHosts(start: string, viewerId: number | null): Promise<Host[]> {
  const records = await queryRows(
    `WITH ${HIDDEN_AUTHORS} SELECT h.role,u.id,u.display_name
     FROM wp_review_hour_hosts h JOIN wp_users u ON u.id=h.user_id
     WHERE h.starts_at=$2 AND lower(u.email)=ANY($3::text[]) AND ${trustedProfile("u")}
       AND u.id NOT IN (SELECT id FROM hidden) ORDER BY h.role`,
    [viewerId, start, pilotHostEmails()],
  );
  return records.map((r) => ({ id: Number(r.id), name: String(r.display_name), role: r.role as ReviewRole }));
}

/** A host can confirm only their own account. A live confirmation cannot be overwritten by another host. */
export async function confirmReviewHost(userId: number, start: string, role: ReviewRole) {
  const allowed = pilotHostEmails();
  try {
    const rows = await queryRows(
      `INSERT INTO wp_review_hour_hosts AS existing (role,starts_at,user_id)
       SELECT $3,$2::timestamptz,u.id FROM wp_users u WHERE u.id=$1 AND lower(u.email)=ANY($4::text[])
         AND ${trustedProfile("u")} AND $2::timestamptz + interval '1 hour'>now()
       ON CONFLICT(role) DO UPDATE SET starts_at=excluded.starts_at,user_id=excluded.user_id
       WHERE existing.starts_at<excluded.starts_at OR (existing.starts_at=excluded.starts_at AND
          (existing.user_id=excluded.user_id OR NOT EXISTS (SELECT 1 FROM wp_users u WHERE u.id=existing.user_id
            AND lower(u.email)=ANY($4::text[]) AND ${trustedProfile("u")})))
       RETURNING user_id`,
      [userId, start, role, allowed],
    );
    return rows.length > 0;
  } catch (error) {
    // Two tabs can try to commit the same person to both roles.
    if ((error as { code?: string }).code === "23505") return false;
    throw error;
  }
}

export async function withdrawReviewHost(userId: number, start: string, role: ReviewRole) {
  await q`DELETE FROM wp_review_hour_hosts WHERE starts_at=${start} AND role=${role} AND user_id=${userId}`;
}

export type FeaturedMatchup = {
  postId: number;
  question: string;
  champion: string;
  opponent: string;
  patch: string | null;
  asker: { id: number; name: string };
  helper: { id: number; name: string; host: boolean };
  answer: string;
  commentId: number;
  outcome: string | null;
};

export async function featuredMatchup(
  viewerId: number | null,
  now = new Date(),
): Promise<FeaturedMatchup | null> {
  const week = featureWeek(now);
  // Pick the last accepted matchup from the preceding week. At cold start, the first
  // eligible answer of the current week holds the slot. Visibility is checked on every read.
  const [r] = await queryRows(
    `WITH ${HIDDEN_AUTHORS} SELECT p.id,p.body,p.author_id,asker.display_name AS asker,d.champion,d.opponent,d.patch,d.outcome,
        c.body AS answer,c.id AS comment_id,c.author_id AS helper_id,helper.display_name AS helper,
        (lower(helper.email)=ANY($5::text[]) AND EXISTS (SELECT 1 FROM wp_review_hour_hosts h
          WHERE h.user_id=helper.id AND h.starts_at=$6::timestamptz)) AS host
      FROM wp_decisions d JOIN wp_posts p ON p.id=d.post_id JOIN wp_users asker ON asker.id=p.author_id
      JOIN wp_comments c ON c.post_id=p.id AND c.id=d.accepted_comment_id AND c.parent_id IS NULL
      JOIN wp_users helper ON helper.id=c.author_id
      WHERE ${visiblePostForInteraction} AND c.status='visible' AND c.author_id<>p.author_id
        AND c.author_id NOT IN (SELECT id FROM hidden) AND ${trustedProfile("asker")} AND ${trustedProfile("helper")}
        AND d.opponent IS NOT NULL AND d.opponent<>'' AND d.accepted_at >= $2::timestamptz AND d.accepted_at <= $4::timestamptz
      ORDER BY (d.accepted_at<$3::timestamptz) DESC,
        CASE WHEN d.accepted_at<$3::timestamptz THEN d.accepted_at END DESC, d.accepted_at ASC, d.post_id ASC LIMIT 1`,
    [viewerId, week.previous, week.start, now.toISOString(), pilotHostEmails(), reviewHour(now).start],
  );
  if (!r) return null;
  return {
    postId: Number(r.id),
    question: String(r.body),
    champion: String(r.champion),
    opponent: String(r.opponent),
    patch: r.patch as string | null,
    asker: { id: Number(r.author_id), name: String(r.asker) },
    helper: { id: Number(r.helper_id), name: String(r.helper), host: r.host === true },
    answer: String(r.answer),
    commentId: Number(r.comment_id),
    outcome: trialOutcomes[r.outcome as TrialOutcome] || null,
  };
}

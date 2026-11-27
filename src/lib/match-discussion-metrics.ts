import { queryRows } from "./db";
import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { excludedDuoPilotEmails } from "./duo-pilot";

const independent = (alias: string) => `NOT(lower(${alias}.email)=ANY($2::text[]))
  AND NOT EXISTS (SELECT 1 FROM wp_pilot_members host WHERE host.user_id=${alias}.id AND host.kind='host')
  AND lower(${alias}.email) !~ '(@example[.](com|net|org)$|[.](test|example|invalid|local)$)'`;

// Aggregate existing rows on the gated pilot dashboard. No new page-view log,
// personal event stream or per-feed request. Public participation includes unlinked authors.
export async function matchDiscussionMetrics() {
  const [row] = await queryRows(`WITH ${HIDDEN_AUTHORS}, active_posts AS MATERIALIZED (
    SELECT p.id,p.author_id,p.created_at,p.kind,p.card_validated,p.data->'matchContext' AS context
    FROM wp_posts p JOIN wp_users u ON u.id=p.author_id
    WHERE p.created_at BETWEEN now()-interval '28 days' AND now() AND ${independent("u")} AND ${visiblePostForInteraction}
  ), discussions AS MATERIALIZED (
    SELECT a.id,a.author_id,a.created_at,a.context->>'discussionKind' AS kind
    FROM active_posts a JOIN wp_decisions d ON d.post_id=a.id WHERE a.kind='card'
      AND a.card_validated AND a.context->>'discussionKind' IN ('question','perspective')
  ), participants AS MATERIALIZED (
    SELECT m.user_id,m.joined_at FROM wp_pilot_members m JOIN wp_users u ON u.id=m.user_id
    WHERE m.kind='participant' AND m.joined_at BETWEEN now()-interval '56 days' AND now()
      AND ${independent("u")} AND u.id NOT IN (SELECT id FROM hidden)
    ORDER BY m.joined_at,m.user_id LIMIT 40
  ), questions AS (
    SELECT d.id,d.created_at,first_reply.at FROM discussions d
    LEFT JOIN LATERAL (SELECT min(c.created_at) AS at FROM wp_comments c JOIN wp_users u ON u.id=c.author_id
      WHERE c.post_id=d.id AND c.author_id<>d.author_id AND c.parent_id IS NULL AND c.status='visible'
        AND c.withdrawn_at IS NULL AND c.created_at BETWEEN d.created_at AND d.created_at + interval '24 hours'
        AND u.id NOT IN (SELECT id FROM hidden) AND ${independent("u")}
        AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN ((d.author_id,u.id),(u.id,d.author_id)))
        AND NOT EXISTS(SELECT 1 FROM wp_mutes m WHERE m.muter_id=d.author_id AND m.muted_id=u.id)
    ) first_reply ON TRUE WHERE d.kind='question' AND d.created_at<=now()-interval '24 hours'
  ), authors AS (
    SELECT author_id,count(DISTINCT (created_at AT TIME ZONE 'UTC')::date) AS days FROM discussions GROUP BY author_id
  ), first_authors AS (
    SELECT a.author_id FROM authors a WHERE NOT EXISTS (
      SELECT 1 FROM wp_posts p JOIN wp_decisions d ON d.post_id=p.id WHERE p.author_id=a.author_id
      AND p.created_at < now()-interval '28 days' AND p.kind='card' AND p.card_validated
      AND p.data #>> '{matchContext,discussionKind}' IN ('question','perspective') AND ${visiblePostForInteraction})
  ) SELECT (SELECT count(DISTINCT author_id) FROM active_posts)::int AS posting_authors,
    (SELECT count(*) FROM first_authors)::int AS first_post,(SELECT count(*) FROM authors)::int AS contextual_authors,
    (SELECT count(*) FROM authors WHERE days>=2)::int AS repeat_post,
    count(*)::int AS questions,count(at)::int AS answered,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch from (at-created_at))/60) AS median_minutes,
    (SELECT count(*) FROM participants WHERE joined_at<=now()-interval '8 days')::int AS return_eligible,
    (SELECT count(*) FROM participants p JOIN wp_pilot_days d ON d.user_id=p.user_id AND d.day_no=7
      WHERE p.joined_at<=now()-interval '8 days' AND (d.social OR d.stats OR d.answer))::int AS returned FROM questions`,
  [null,excludedDuoPilotEmails()]);
  return { postingAuthors:Number(row.posting_authors), contextualAuthors:Number(row.contextual_authors), firstPost:Number(row.first_post), repeatPost:Number(row.repeat_post),
    questions:Number(row.questions), answered:Number(row.answered), medianMinutes:row.median_minutes == null ? null : Number(row.median_minutes),
    returnEligible:Number(row.return_eligible), returned:Number(row.returned) };
}

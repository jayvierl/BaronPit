import { q, queryRows } from "./db";
import { TERMS_VERSION } from "./account-policy";
import { duoEligibilityCte, duoIdentityCte, duoEnabled } from "./duo";
import { PATCH_PUBLISHER } from "./patch-notes";
import { pilotHostEmails } from "./pilot";
import { DUO_STUDY_VERSION } from "./duo-study-version";
import { sharedStarts } from "./verified-duo-game";

// Include named live QA accounts as well as reserved synthetic email domains.
export function excludedDuoPilotEmails() {
  return [...pilotHostEmails(), PATCH_PUBLISHER,
    ...(process.env.PILOT_FIXTURE_EMAILS ?? "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean)];
}

function independent(alias: string) {
  return `NOT (lower(${alias}.email)=ANY($3::text[]))
    AND lower(${alias}.email) !~ '(@example[.](com|net|org)$|[.](invalid|test|example)$)'
    AND NOT EXISTS(SELECT 1 FROM wp_pilot_members host WHERE host.user_id=${alias}.id AND host.kind='host')`;
}

export async function duoPilotState(id: number) {
  const [row] = await q`SELECT joined_at FROM wp_duo_pilot_members WHERE user_id=${id} AND study_version=${DUO_STUDY_VERSION} AND joined_at>now()-interval '28 days'`;
  return row ? new Date(String(row.joined_at)).toISOString() : null;
}

export async function enrollDuoPilot(id: number) {
  if (!duoEnabled()) return false;
  const rows = await queryRows(`${duoEligibilityCte}
    INSERT INTO wp_duo_pilot_members(user_id,study_version)
    SELECT u.id,$4 FROM me JOIN wp_users u ON u.id=me.id WHERE ${independent("u")}
    ON CONFLICT(user_id) DO UPDATE SET study_version=excluded.study_version,joined_at=CASE WHEN wp_duo_pilot_members.study_version<>excluded.study_version OR wp_duo_pilot_members.joined_at<=now()-interval '28 days'
      THEN now() ELSE wp_duo_pilot_members.joined_at END RETURNING user_id`, [id, TERMS_VERSION, excludedDuoPilotEmails(),DUO_STUDY_VERSION]);
  return rows.length > 0;
}

export async function withdrawDuoPilot(id: number) {
  await q`DELETE FROM wp_duo_pilot_members WHERE user_id=${id}`;
}

export interface DuoPilotResults {
  enrolled: number;
  listed: number;
  sent: number;
  acceptedInvites: number;
  pairs: number;
  accepted: number;
  acceptedRequests: number;
  medianAcceptanceMinutes: number | null;
  played: number;
  mutual: number;
  maturePlayed: number;
  observedRepeat: number;
  repeatUnknown: number;
  pairedPeople: number;
  acceptedPeople: number;
  playedPeople: number;
  mutualPeople: number;
}

type DuoWindow = { start: string; end: string; label: string; current: boolean };

export function duoPilotWindows(now = new Date()): { current: DuoWindow; mature: DuoWindow } {
  const week = 7 * 86_400_000;
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  // Leave one entire week of follow-up after the fixed Monday-to-Monday request window.
  const matureEnd = monday.getTime() - week;
  return {
    current: { start: new Date(now.getTime() - week).toISOString(), end: now.toISOString(),
      label: "Current seven days", current: true },
    mature: { start: new Date(matureEnd - week).toISOString(), end: new Date(matureEnd).toISOString(),
      label: "Completed week with follow-up", current: false },
  };
}

// Read operational facts only. The research store contains no counterpart, listing or match identifier.
export async function duoPilotResults(window = duoPilotWindows().current): Promise<DuoPilotResults> {
  const [row] = await queryRows(`${duoIdentityCte}, active AS MATERIALIZED (
    SELECT c.user_id,c.joined_at FROM wp_duo_pilot_members c JOIN wp_users u ON u.id=c.user_id
    WHERE c.study_version=$7 AND c.joined_at<=now() AND c.joined_at>now()-interval '28 days' AND ($6::bool OR c.joined_at<$5::timestamptz) AND ${independent("u")}
  ), invites AS MATERIALIZED (
    SELECT CASE WHEN s.user_id IS NOT NULL AND o.user_id IS NOT NULL THEN r.sender_puuid END AS sender_puuid,
      CASE WHEN s.user_id IS NOT NULL AND o.user_id IS NOT NULL THEN l.puuid END AS owner_puuid,
      r.id,r.created_at,r.accepted_at,r.status,r.sender_requeue,r.owner_requeue,
      s.user_id AS enrolled_sender,o.user_id AS enrolled_owner
    FROM wp_duo_requests r JOIN wp_lfg l ON l.id=r.listing_id
    LEFT JOIN active s ON s.user_id=r.sender_id AND s.joined_at<=r.created_at
    LEFT JOIN active o ON o.user_id=l.user_id AND o.joined_at<=r.created_at
    JOIN wp_users sender ON sender.id=r.sender_id JOIN wp_users owner ON owner.id=l.user_id
    WHERE (s.user_id IS NOT NULL OR o.user_id IS NOT NULL) AND r.sender_id<>l.user_id
      AND r.created_at>=$4::timestamptz AND r.created_at<$5::timestamptz
      AND l.safe_listing AND l.status IN ('open','closed') AND r.status IN ('pending','accepted','declined')
      AND NOT EXISTS (SELECT 1 FROM wp_mutes m WHERE (m.muter_id,m.muted_id) IN ((sender.id,owner.id),(owner.id,sender.id)))
      AND NOT EXISTS (SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN ((sender.id,owner.id),(owner.id,sender.id)))
      AND NOT EXISTS (SELECT 1 FROM wp_reports f WHERE f.status='open' AND
        ((f.target_kind='duo_request' AND f.target_id=r.id) OR (f.target_kind='lfg' AND f.target_id=l.id)))
      AND ${independent("sender")} AND ${independent("owner")}
  ), bilateral AS (
    SELECT least(r.enrolled_sender,r.enrolled_owner) AS first_id,greatest(r.enrolled_sender,r.enrolled_owner) AS second_id,
      r.status='accepted' AND r.accepted_at BETWEEN r.created_at AND now() AS accepted,
      r.sender_requeue AND r.owner_requeue AS mutual,ck.covered_until,r.created_at,r.accepted_at,
      ARRAY(SELECT started FROM (${sharedStarts}) observed WHERE sender.fetched_at>now()-interval '24 hours' AND owner.fetched_at>now()-interval '24 hours'
        UNION SELECT ck.first_game_at UNION SELECT ck.repeat_game_at) AS starts
    FROM invites r
    JOIN eligible sender ON sender.id=r.enrolled_sender AND sender.puuid=r.sender_puuid
    JOIN eligible owner ON owner.id=r.enrolled_owner AND owner.puuid=r.owner_puuid AND owner.age_band=sender.age_band AND owner.platform=sender.platform
    LEFT JOIN wp_duo_game_checks ck ON ck.request_id=r.id AND ck.expires_at>now()
    WHERE r.enrolled_sender IS NOT NULL AND r.enrolled_owner IS NOT NULL
  ), pair_start AS (
    SELECT first_id,second_id,bool_or(accepted) AS accepted,bool_or(accepted AND mutual) AS mutual,
      min(t) FILTER(WHERE accepted) AS first_at
    FROM bilateral LEFT JOIN LATERAL unnest(starts) t ON t>accepted_at AND t<=now() GROUP BY first_id,second_id
  ), pairs AS (
    SELECT p.*,p.first_at IS NOT NULL AS played,
      p.first_at IS NOT NULL AND p.first_at+interval '168 hours'<=now() AS mature,
      bool_or((t AT TIME ZONE 'UTC')::date>(p.first_at AT TIME ZONE 'UTC')::date
        AND t<=p.first_at+interval '168 hours') IS TRUE AS repeated,
      bool_or(b.accepted AND b.accepted_at<=p.first_at AND b.covered_until>=p.first_at+interval '168 hours') IS TRUE AS covered
    FROM pair_start p JOIN bilateral b USING(first_id,second_id)
    LEFT JOIN LATERAL unnest(b.starts) t ON b.accepted AND t>b.accepted_at AND t<=now()
    GROUP BY p.first_id,p.second_id,p.accepted,p.mutual,p.first_at
  ), pair_counts AS (
    SELECT count(*)::int pairs,count(*) FILTER(WHERE accepted)::int accepted,
      count(*) FILTER(WHERE played)::int played,count(*) FILTER(WHERE played AND mutual)::int mutual,
      count(*) FILTER(WHERE mature)::int AS "maturePlayed",count(*) FILTER(WHERE mature AND repeated)::int AS "observedRepeat",
      count(*) FILTER(WHERE mature AND NOT repeated AND NOT covered)::int AS "repeatUnknown" FROM pairs
  )
  SELECT (SELECT count(*)::int FROM active) enrolled,
    (SELECT count(DISTINCT c.user_id)::int FROM active c JOIN wp_lfg l ON l.user_id=c.user_id
      WHERE l.safe_listing AND l.status IN ('open','closed') AND l.created_at>=greatest(c.joined_at,$4::timestamptz) AND l.created_at<$5::timestamptz) listed,
    (SELECT count(DISTINCT enrolled_sender)::int FROM invites) sent,
    (SELECT count(DISTINCT enrolled_owner)::int FROM invites WHERE status='accepted' AND accepted_at BETWEEN created_at AND now()) AS "acceptedInvites",
    (SELECT count(*)::int FROM bilateral WHERE accepted) AS "acceptedRequests",
    (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM accepted_at-created_at)/60))::numeric)::int
      FROM bilateral WHERE accepted) AS "medianAcceptanceMinutes",
    pair_counts.*,people_counts.*
  FROM pair_counts CROSS JOIN (
    SELECT count(DISTINCT person)::int AS "pairedPeople",count(DISTINCT person) FILTER(WHERE accepted)::int AS "acceptedPeople",
      count(DISTINCT person) FILTER(WHERE played)::int AS "playedPeople",count(DISTINCT person) FILTER(WHERE played AND mutual)::int AS "mutualPeople"
    FROM pairs CROSS JOIN LATERAL unnest(ARRAY[first_id,second_id]) AS people(person)
  ) people_counts`, [null, TERMS_VERSION, excludedDuoPilotEmails(),window.start,window.end,window.current,DUO_STUDY_VERSION]);
  return row as unknown as DuoPilotResults;
}

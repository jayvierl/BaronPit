import { q, queryRows } from "./db";
import { TERMS_VERSION } from "./account-policy";
import { duoEligibilityCte, duoEnabled } from "./duo";
import { PATCH_PUBLISHER } from "./patch-notes";
import { pilotHostEmails } from "./pilot";
import { sharedGame } from "./verified-duo-game";

// Include named live QA accounts as well as reserved synthetic email domains.
function excludedEmails() {
  return [...pilotHostEmails(), PATCH_PUBLISHER,
    ...(process.env.PILOT_FIXTURE_EMAILS ?? "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean)];
}

function independent(alias: string) {
  return `NOT (lower(${alias}.email)=ANY($3::text[]))
    AND lower(${alias}.email) !~ '(@example[.](com|net|org)$|[.](invalid|test|example)$)'
    AND NOT EXISTS(SELECT 1 FROM wp_pilot_members host WHERE host.user_id=${alias}.id AND host.kind='host')`;
}

export async function duoPilotState(id: number) {
  const [row] = await q`SELECT joined_at FROM wp_duo_pilot_members WHERE user_id=${id} AND joined_at>now()-interval '28 days'`;
  return row ? new Date(String(row.joined_at)).toISOString() : null;
}

export async function enrollDuoPilot(id: number) {
  if (!duoEnabled()) return false;
  const rows = await queryRows(`${duoEligibilityCte}
    INSERT INTO wp_duo_pilot_members(user_id)
    SELECT u.id FROM me JOIN wp_users u ON u.id=me.id WHERE ${independent("u")}
    ON CONFLICT(user_id) DO UPDATE SET joined_at=CASE WHEN wp_duo_pilot_members.joined_at<=now()-interval '28 days'
      THEN now() ELSE wp_duo_pilot_members.joined_at END RETURNING user_id`, [id, TERMS_VERSION, excludedEmails()]);
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
  played: number;
  mutual: number;
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
  const [row] = await queryRows(`${duoEligibilityCte}, active AS MATERIALIZED (
    SELECT c.user_id,c.joined_at FROM wp_duo_pilot_members c JOIN wp_users u ON u.id=c.user_id
    WHERE c.joined_at<=now() AND c.joined_at>now()-interval '28 days' AND ($6::bool OR c.joined_at<$5::timestamptz) AND ${independent("u")}
  ), invites AS MATERIALIZED (
    SELECT CASE WHEN s.user_id IS NOT NULL AND o.user_id IS NOT NULL THEN r.sender_puuid END AS sender_puuid,
      CASE WHEN s.user_id IS NOT NULL AND o.user_id IS NOT NULL THEN l.puuid END AS owner_puuid,
      r.created_at,r.accepted_at,r.status,r.sender_requeue,r.owner_requeue,
      s.user_id AS enrolled_sender,o.user_id AS enrolled_owner
    FROM wp_duo_requests r JOIN wp_lfg l ON l.id=r.listing_id
    LEFT JOIN active s ON s.user_id=r.sender_id AND s.joined_at<=r.created_at
    LEFT JOIN active o ON o.user_id=l.user_id AND o.joined_at<=r.created_at
    JOIN wp_users sender ON sender.id=r.sender_id JOIN wp_users owner ON owner.id=l.user_id
    WHERE (s.user_id IS NOT NULL OR o.user_id IS NOT NULL) AND r.sender_id<>l.user_id
      AND r.created_at>=$4::timestamptz AND r.created_at<$5::timestamptz
      AND l.safe_listing AND l.status IN ('open','closed') AND r.status IN ('pending','accepted','declined')
      AND ${independent("sender")} AND ${independent("owner")}
  ), bilateral AS (
    SELECT least(r.enrolled_sender,r.enrolled_owner) AS first_id,greatest(r.enrolled_sender,r.enrolled_owner) AS second_id,
      r.status='accepted' AND r.accepted_at BETWEEN r.created_at AND now() AS accepted,
      r.sender_requeue AND r.owner_requeue AS mutual,
      r.sender_requeue OR r.owner_requeue OR (sender.id IS NOT NULL AND owner.id IS NOT NULL AND ${sharedGame}) AS evidence
    FROM invites r
    LEFT JOIN eligible sender ON sender.id=r.enrolled_sender AND sender.puuid=r.sender_puuid
    LEFT JOIN eligible owner ON owner.id=r.enrolled_owner AND owner.puuid=r.owner_puuid
    WHERE r.enrolled_sender IS NOT NULL AND r.enrolled_owner IS NOT NULL
  ), pairs AS (
    SELECT first_id,second_id,bool_or(accepted) accepted,bool_or(accepted AND evidence) played,
      bool_or(accepted AND evidence AND mutual) mutual FROM bilateral GROUP BY first_id,second_id
  ), pair_counts AS (
    SELECT count(*)::int pairs,count(*) FILTER(WHERE accepted)::int accepted,
      count(*) FILTER(WHERE played)::int played,count(*) FILTER(WHERE mutual)::int mutual FROM pairs
  )
  SELECT (SELECT count(*)::int FROM active) enrolled,
    (SELECT count(DISTINCT c.user_id)::int FROM active c JOIN wp_lfg l ON l.user_id=c.user_id
      WHERE l.safe_listing AND l.status IN ('open','closed') AND l.created_at>=greatest(c.joined_at,$4::timestamptz) AND l.created_at<$5::timestamptz) listed,
    (SELECT count(DISTINCT enrolled_sender)::int FROM invites) sent,
    (SELECT count(DISTINCT enrolled_owner)::int FROM invites WHERE status='accepted' AND accepted_at BETWEEN created_at AND now()) AS "acceptedInvites",
    pair_counts.*,people_counts.*
  FROM pair_counts CROSS JOIN (
    SELECT count(DISTINCT person)::int AS "pairedPeople",count(DISTINCT person) FILTER(WHERE accepted)::int AS "acceptedPeople",
      count(DISTINCT person) FILTER(WHERE played)::int AS "playedPeople",count(DISTINCT person) FILTER(WHERE mutual)::int AS "mutualPeople"
    FROM pairs CROSS JOIN LATERAL unnest(ARRAY[first_id,second_id]) AS people(person)
  ) people_counts`, [null, TERMS_VERSION, excludedEmails(),window.start,window.end,window.current]);
  return row as unknown as DuoPilotResults;
}

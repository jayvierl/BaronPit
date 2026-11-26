import { q, getSql, queryRows } from "./db";
import type { User } from "./auth";
import { HIDDEN_AUTHORS, visibleContentKind, visiblePostForInteraction } from "./community-queries";
import { validId } from "./ids";
import { PATCH_PUBLISHER } from "./patch-notes";

export const pilotHostEmails = () =>
  [process.env.ADMIN_EMAILS, process.env.PILOT_HOST_EMAILS]
    .flatMap((value) => (value ?? "").split(","))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
export const isPilotHost = (user: User) => pilotHostEmails().includes(user.email.toLowerCase());
export type PilotChannel = "club" | "community";
export type PilotPage = "stats" | "social" | "answer";
export function pilotChannel(value: unknown): value is PilotChannel {
  return value === "club" || value === "community";
}
type Enrollment = {
  kind: "host" | "participant";
  channel: PilotChannel;
  role: "UTILITY" | "BOTTOM" | null;
  joinedAt: string;
};
export type Interest = { audience: "club" | "coach"; intent: "discuss" | "trial"; budget: string };
const budgets = ["unknown", "free", "1-10", "11-25", "26+"];
export function validInterest(data: Record<string, unknown>): data is Record<string, unknown> & Interest {
  return (
    (data.audience === "club" || data.audience === "coach") &&
    (data.intent === "discuss" || data.intent === "trial") &&
    typeof data.budget === "string" &&
    budgets.includes(data.budget)
  );
}
export async function pilotState(
  id: number,
): Promise<{ member: Enrollment | null; interest: Interest | null }> {
  const [[m], [i]] = await Promise.all([
    q`SELECT kind,channel,role,joined_at FROM wp_pilot_members WHERE user_id=${id}`,
    q`SELECT audience,intent,budget FROM wp_pilot_interest WHERE user_id=${id}`,
  ]);
  return {
    member: m
      ? ({
          kind: m.kind,
          channel: m.channel,
          role: m.role,
          joinedAt: new Date(String(m.joined_at)).toISOString(),
        } as Enrollment)
      : null,
    interest: i ? ({ audience: i.audience, intent: i.intent, budget: i.budget } as Interest) : null,
  };
}
export async function joinPilot(user: User, channel: PilotChannel, role: unknown) {
  const host = isPilotHost(user);
  if (!host && role !== "BOTTOM" && role !== "UTILITY") return false;
  // A claimed primary profile supplies an observed rank and played role. This grants no ownership or duo privileges.
  const result = await q`INSERT INTO wp_pilot_members(user_id,kind,channel,role)
    SELECT ${user.id},${host ? "host" : "participant"},${channel},${host ? null : role}::text
    WHERE ${host} OR EXISTS(SELECT 1 FROM wp_links l JOIN wp_players p ON p.puuid=l.puuid WHERE l.user_id=${user.id}
      AND l.is_primary AND lower(p.platform)='na1' AND upper(p.rank_tier) IN ('SILVER','GOLD','PLATINUM')
      AND p.fetched_at>now()-interval '7 days' AND p.snapshot->'roles' ? ${host ? "" : role}::text
      AND jsonb_typeof(p.snapshot->'roles'->${host ? "" : role}::text)='number'
      AND p.snapshot->'roles'->${host ? "" : role}::text > '0'::jsonb)
    ON CONFLICT(user_id) DO NOTHING RETURNING user_id`;
  if (result.length) return true;
  return (await q`SELECT 1 FROM wp_pilot_members WHERE user_id=${user.id}`).length > 0;
}
export async function leavePilot(id: number) {
  const sql = await getSql();
  await sql.transaction([
    sql`DELETE FROM wp_pilot_members WHERE user_id=${id}`,
    sql`DELETE FROM wp_duo_pilot_members WHERE user_id=${id}`,
    sql`DELETE FROM wp_pilot_interest WHERE user_id=${id}`,
    sql`DELETE FROM wp_evening_interest WHERE user_id=${id}`,
  ]);
}
export async function recordInterest(id: number, data: Interest) {
  await q`INSERT INTO wp_pilot_interest(user_id,audience,intent,budget) VALUES(${id},${data.audience},${data.intent},${data.budget})
    ON CONFLICT(user_id) DO UPDATE SET audience=excluded.audience,intent=excluded.intent,budget=excluded.budget,updated_at=now()`;
}
export async function recordPilotVisit(id: number, kind: PilotPage, postId?: unknown) {
  if (kind === "answer" && !validId(postId)) return;
  const params: unknown[] = [id, kind !== "stats", kind === "stats", kind === "answer"];
  // Only a currently visible independent answer can satisfy the return criterion. The page ID is transient.
  const answerCheck =
    kind === "answer"
      ? `AND EXISTS (
    SELECT 1 FROM wp_decisions d JOIN wp_posts p ON p.id=d.post_id
    JOIN wp_comments c ON c.post_id=d.post_id AND c.id=d.accepted_comment_id
    WHERE p.id=$5 AND ${visiblePostForInteraction} AND c.status='visible' AND c.parent_id IS NULL
      AND c.author_id<>p.author_id AND c.author_id<>$1 AND c.author_id NOT IN (SELECT id FROM hidden)
  )`
      : "";
  if (kind === "answer") params.push(postId);
  await queryRows(
    `WITH ${HIDDEN_AUTHORS}
    INSERT INTO wp_pilot_days(user_id,day_no,social,stats,answer)
    SELECT user_id,floor(extract(epoch FROM(now()-joined_at))/86400)::int,$2,$3,$4
    FROM wp_pilot_members WHERE user_id=$1 AND joined_at<=now() AND joined_at>now()-interval '28 days' ${answerCheck}
    ON CONFLICT(user_id,day_no) DO UPDATE SET social=wp_pilot_days.social OR excluded.social,
      stats=wp_pilot_days.stats OR excluded.stats,answer=wp_pilot_days.answer OR excluded.answer
    WHERE (excluded.social AND NOT wp_pilot_days.social) OR (excluded.stats AND NOT wp_pilot_days.stats)
      OR (excluded.answer AND NOT wp_pilot_days.answer)`,
    params,
  );
}
export async function clearExpiredPilotData() {
  const sql = await getSql();
  await sql.transaction([
    sql`DELETE FROM wp_pilot_members WHERE joined_at<=now()-interval '56 days'`,
    sql`DELETE FROM wp_duo_pilot_members WHERE joined_at<=now()-interval '28 days'`,
    sql`DELETE FROM wp_evening_interest WHERE session_start<=now()`,
    sql`DELETE FROM wp_duo_arrival_consent c USING wp_duo_pilot_members m
        WHERE c.user_id=m.user_id AND c.study_start<>m.joined_at`,
    sql`DELETE FROM wp_pilot_interest WHERE updated_at<=now()-interval '56 days'`,
  ]);
}

export type WeeklyReview = {
  weekStart: string;
  hostMinutes: number;
  safetyMinutes: number;
  costCents: number;
  interviews: number;
  sampled: number;
  useful: number;
  drill: "unrun" | "pass" | "fail";
};
export function validReview(
  input: Record<string, unknown>,
  today = new Date(),
): input is WeeklyReview & Record<string, unknown> {
  if (typeof input.weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart)) return false;
  const d = new Date(input.weekStart + "T00:00:00Z");
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== input.weekStart ||
    d.getUTCDay() !== 1 ||
    d > today
  )
    return false;
  const counts = {
    hostMinutes: 10080,
    safetyMinutes: 10080,
    costCents: 10000000,
    interviews: 1000,
    sampled: 10000,
    useful: 10000,
  };
  return (
    Object.entries(counts).every(
      ([key, max]) =>
        typeof input[key] === "number" &&
        Number.isInteger(input[key]) &&
        input[key] >= 0 &&
        input[key] <= max,
    ) &&
    Number(input.useful) <= Number(input.sampled) &&
    (input.drill === "unrun" || input.drill === "pass" || input.drill === "fail")
  );
}
export async function saveReview(r: WeeklyReview) {
  await q`INSERT INTO wp_pilot_reviews(week_start,host_minutes,safety_minutes,cost_cents,interviews,sampled,useful,drill)
    VALUES(${r.weekStart}::date,${r.hostMinutes},${r.safetyMinutes},${r.costCents},${r.interviews},${r.sampled},${r.useful},${r.drill})
    ON CONFLICT(week_start) DO UPDATE SET host_minutes=excluded.host_minutes,safety_minutes=excluded.safety_minutes,cost_cents=excluded.cost_cents,
    interviews=excluded.interviews,sampled=excluded.sampled,useful=excluded.useful,drill=excluded.drill`;
}

type Score = {
  cohort: string;
  people: number;
  askers: number;
  questions: number;
  judged: number;
  timely: number;
  peer: number;
  outsider: number;
  hosted: number;
  firstExchange: number;
  weekOneReady: number;
  weekOneExchange: number;
  medianHours: number | null;
  mature: number;
  returns: number;
  statsOnly: number;
  otherReads: number;
  readers: number;
  writers: number;
};
/** Only the first 40 consenting non-hosts enter decision metrics. No user-level events or content are exported. */
export async function pilotDashboard() {
  const [scores, staffing, interest, reviews] = await Promise.all([
    queryRows(
      `WITH participants AS (
      SELECT m.* FROM wp_pilot_members m JOIN wp_users u ON u.id=m.user_id
      WHERE m.kind='participant' AND m.joined_at>now()-interval '56 days' AND NOT(lower(u.email)=ANY($1::text[]))
      ORDER BY m.joined_at,m.user_id LIMIT 40
    ), questions AS (
      SELECT p.id,m.user_id,m.channel,m.joined_at,p.created_at,d.accepted_at,
        CASE WHEN c.id IS NULL OR a.email=$2 THEN NULL
          WHEN h.kind='host' OR lower(a.email)=ANY($1::text[]) THEN 'host'
          WHEN h.kind='participant' THEN 'peer' ELSE 'outside' END AS source,
        c.created_at AS replied
      FROM participants m JOIN wp_posts p ON p.author_id=m.user_id
      JOIN wp_decisions d ON d.post_id=p.id
      LEFT JOIN wp_rooms r ON r.id=p.room_id
      LEFT JOIN wp_comments c ON c.id=d.accepted_comment_id AND c.post_id=p.id AND c.author_id<>p.author_id
        AND c.parent_id IS NULL AND c.status='visible' AND c.created_at>=p.created_at
        AND d.accepted_at>=c.created_at AND d.accepted_at<m.joined_at+interval '28 days'
      LEFT JOIN wp_users a ON a.id=c.author_id
      LEFT JOIN wp_pilot_members h ON h.user_id=c.author_id AND h.joined_at<=c.created_at
      WHERE p.status='visible' AND (p.room_id IS NULL OR r.safety_status='visible') AND ${visibleContentKind}
        AND p.created_at>=m.joined_at AND p.created_at<m.joined_at+interval '28 days'
    ), activity AS (
      SELECT m.*,
        EXISTS(SELECT 1 FROM wp_pilot_days d WHERE d.user_id=m.user_id AND d.day_no BETWEEN 21 AND 27 AND d.answer) AS read_answer,
        EXISTS(SELECT 1 FROM wp_pilot_days d WHERE d.user_id=m.user_id AND d.day_no BETWEEN 21 AND 27 AND d.stats) AS read_stats,
        EXISTS(SELECT 1 FROM wp_pilot_days d WHERE d.user_id=m.user_id AND d.day_no BETWEEN 21 AND 27 AND d.social) AS read_social,
        (EXISTS(SELECT 1 FROM wp_posts p LEFT JOIN wp_rooms r ON r.id=p.room_id WHERE p.author_id=m.user_id AND p.status='visible'
          AND (p.room_id IS NULL OR r.safety_status='visible') AND ${visibleContentKind} AND NOT p.data @> '{"briefing":true}'
          AND p.created_at>=m.joined_at+interval '21 days' AND p.created_at<m.joined_at+interval '28 days')
        OR EXISTS(SELECT 1 FROM wp_comments c JOIN wp_posts p ON p.id=c.post_id LEFT JOIN wp_rooms r ON r.id=p.room_id
          LEFT JOIN wp_comments parent ON parent.id=c.parent_id
          WHERE c.author_id=m.user_id AND c.status='visible' AND p.status='visible'
          AND coalesce(parent.status,'visible')='visible' AND (p.room_id IS NULL OR r.safety_status='visible') AND ${visibleContentKind}
          AND c.created_at>=m.joined_at+interval '21 days' AND c.created_at<m.joined_at+interval '28 days')
        OR EXISTS(SELECT 1 FROM questions q WHERE q.user_id=m.user_id AND q.source IS NOT NULL AND q.accepted_at>=m.joined_at+interval '21 days')
        OR EXISTS(SELECT 1 FROM questions q JOIN wp_decisions d ON d.post_id=q.id WHERE q.user_id=m.user_id AND q.source IS NOT NULL
          AND d.tried_at>=m.joined_at+interval '21 days' AND d.tried_at<m.joined_at+interval '28 days')) AS contributed,
        (SELECT min(accepted_at) FROM questions q WHERE q.user_id=m.user_id AND q.source IN ('peer','outside')) AS first_useful
      FROM participants m
    ), cohorts(cohort) AS (VALUES ('all'),('club'),('community'))
    SELECT k.cohort, totals.*, replies.* FROM cohorts k
    CROSS JOIN LATERAL (
      SELECT count(*)::int people,
        count(*) FILTER(WHERE a.first_useful IS NOT NULL)::int AS "firstExchange",
        round((percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM(a.first_useful-a.joined_at))/3600))::numeric,1)::float8 AS "medianHours",
        count(*) FILTER(WHERE a.joined_at<=now()-interval '7 days')::int AS "weekOneReady",
        count(*) FILTER(WHERE a.joined_at<=now()-interval '7 days' AND a.first_useful<a.joined_at+interval '7 days')::int AS "weekOneExchange",
        count(*) FILTER(WHERE a.joined_at<=now()-interval '28 days')::int AS mature,
        count(*) FILTER(WHERE a.joined_at<=now()-interval '28 days' AND (a.read_answer OR a.contributed))::int AS returns,
        count(*) FILTER(WHERE a.joined_at<=now()-interval '28 days' AND a.read_stats AND NOT(a.read_social OR a.contributed))::int AS "statsOnly",
        count(*) FILTER(WHERE a.joined_at<=now()-interval '28 days' AND a.read_social AND NOT(a.read_answer OR a.contributed))::int AS "otherReads",
        count(*) FILTER(WHERE a.joined_at<=now()-interval '28 days' AND a.read_answer AND NOT a.contributed)::int AS readers,
        count(*) FILTER(WHERE a.joined_at<=now()-interval '28 days' AND a.contributed)::int AS writers
      FROM activity a WHERE k.cohort='all' OR a.channel=k.cohort
    ) totals CROSS JOIN LATERAL (
      SELECT count(DISTINCT user_id)::int AS askers,count(*)::int AS questions,
        count(*) FILTER(WHERE created_at<=least(now()-interval '24 hours',joined_at+interval '27 days'))::int AS judged,
        count(*) FILTER(WHERE created_at<=least(now()-interval '24 hours',joined_at+interval '27 days') AND source IN ('peer','outside') AND replied<=created_at+interval '24 hours')::int AS timely,
        count(*) FILTER(WHERE source='peer')::int AS peer,count(*) FILTER(WHERE source='outside')::int AS outsider,count(*) FILTER(WHERE source='host')::int AS hosted
      FROM questions q WHERE k.cohort='all' OR q.channel=k.cohort
    ) replies ORDER BY CASE WHEN k.cohort='all' THEN 0 ELSE 1 END,k.cohort`,
      [pilotHostEmails(), PATCH_PUBLISHER],
    ),
    q`SELECT kind,count(*)::int n FROM wp_pilot_members WHERE joined_at>now()-interval '56 days' GROUP BY kind`,
    q`SELECT audience,intent,budget,count(*)::int n FROM wp_pilot_interest WHERE updated_at>now()-interval '56 days' GROUP BY audience,intent,budget ORDER BY audience,intent,budget`,
    q`SELECT to_char(week_start,'YYYY-MM-DD') AS "weekStart",host_minutes "hostMinutes",safety_minutes "safetyMinutes",cost_cents "costCents",
      interviews,sampled,useful,drill FROM wp_pilot_reviews ORDER BY week_start DESC LIMIT 8`,
  ]);
  return {
    scores: scores as Score[],
    hosts: Number(staffing.find((r) => r.kind === "host")?.n ?? 0),
    enrolled: Number(staffing.find((r) => r.kind === "participant")?.n ?? 0),
    interest: interest as (Interest & { n: number })[],
    reviews: reviews as WeeklyReview[],
  };
}

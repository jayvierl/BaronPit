import { randomUUID } from "node:crypto";
import { getSql, q } from "./db";
import { validId } from "./ids";
import { isAdmin, isBanned, rateLimit, type User } from "./auth";
import { viewerCanSeePostOrComment } from "./community-queries";
import { canReportDuo, duoEnabled, reviewedDuoRequestState } from "./duo";
import { TERMS_VERSION } from "./account-policy";
import { days, urgentRules, targetKinds, type Decision, type Rule, type TargetKind } from "./safety-policy";

type Sql = Awaited<ReturnType<typeof getSql>>;
type Row = Record<string, unknown>;

export function isSafetyOwner(email: string) {
  return (
    isAdmin(email) &&
    (process.env.SAFETY_OWNER_EMAILS ?? "")
      .split(",")
      .some((address) => address.trim().toLowerCase() === email.toLowerCase())
  );
}

// All SQL identifiers and expressions below are constant. Identifiers from a request
// are validated before arriving here, and all actual values are bound separately.
const definition = {
  post: {
    table: "wp_posts",
    owner: "t.author_id",
    evidence:
      "concat_ws(' ', t.body, t.data->>'question',t.data->>'rationale',t.data->>'champion',t.data->>'options')",
    status: "status",
    visible: "visible",
  },
  comment: {
    table: "wp_comments",
    owner: "t.author_id",
    evidence: "t.body",
    status: "status",
    visible: "visible",
  },
  user: {
    table: "wp_users",
    owner: "t.id",
    evidence: "concat_ws(' ',t.display_name,t.bio)",
    status: "safety_status",
    visible: "visible",
  },
  room: {
    table: "wp_rooms",
    owner: "t.created_by",
    evidence: "concat_ws(' ',t.name,t.description)",
    status: "safety_status",
    visible: "visible",
  },
  lfg: {
    table: "wp_lfg",
    owner: "t.user_id",
    evidence: "concat_ws(' ',t.note,t.play_times,t.vibe)",
    status: "status",
    visible: "open",
  },
  duo_request: {
    table: "wp_duo_requests",
    owner: "t.sender_id",
    evidence: "'Duo invitation for listing ' || t.listing_id",
    status: "status",
    visible: "pending",
  },
} as const;
function target(kind: TargetKind) {
  const d = definition[kind];
  const eligible =
    kind === "post"
      ? "(t.kind NOT IN ('media','clip') OR (t.kind='clip' AND t.clip_review_required))"
      : "true";
  const url =
    kind === "post"
      ? "CASE WHEN t.kind='clip' AND t.clip_review_required THEN t.data->>'url' END"
      : "NULL::text";
  return `SELECT '${kind}' AS kind,t.id,t.created_at,${d.owner} AS author, t.${d.status} AS status,
    left(${d.evidence},750) AS excerpt,${eligible} AS releasable,${url} AS link FROM ${d.table} t`;
}
const currentTarget = (kind: TargetKind) => target(kind) + " WHERE t.id=$2";
const locking = (sql: Sql, kind: TargetKind, id: number) =>
  sql`SELECT pg_advisory_xact_lock(hashtext(${"wp-review:" + kind + ":" + id}))`;

function duoRestorationLocks(sql: Sql, kind: TargetKind, id: number) {
  if (kind !== "duo_request") return [];
  // Match the order of an ordinary acceptance and serialize with a listing closure.
  const participants = " FROM wp_duo_requests r JOIN wp_lfg l ON l.id=r.listing_id WHERE r.id=$1";
  return [
    sql("SELECT pg_advisory_xact_lock(hashtext('duo-session'),least(r.sender_id,l.user_id))" + participants, [id]),
    sql("SELECT pg_advisory_xact_lock(hashtext('duo-session'),greatest(r.sender_id,l.user_id))" + participants, [id]),
    sql("SELECT pg_advisory_xact_lock(least(r.sender_id,l.user_id),greatest(r.sender_id,l.user_id))" + participants, [id]),
    sql("SELECT l.id" + participants + " FOR SHARE OF l", [id]),
  ];
}

function restoreArgs(kind: TargetKind, id: number, op: string) {
  return kind === "duo_request" ? [kind, id, op, TERMS_VERSION, duoEnabled()] : [kind, id, op];
}
const activeReports = "SELECT * FROM wp_reports WHERE target_kind=$1 AND target_id=$2 AND status='open'";
const activeUrgent =
  "SELECT * FROM wp_safety_urgent WHERE target_kind=$1 AND target_id=$2 AND reviewed_at IS NULL";

function rememberPrevious(kind: TargetKind) {
  const d = definition[kind];
  const name = kind === "user" ? "t.display_name" : kind === "room" ? "t.name" : "NULL";
  const desc = kind === "user" ? "t.bio" : kind === "room" ? "t.description" : "NULL";
  return `INSERT INTO wp_safety_holds(target_kind,target_id,prior_status,original_name,original_description)
    SELECT $1,t.id,t.${d.status},${name},${desc} FROM ${d.table} t WHERE t.id=$2 AND `;
}
function changeState(kind: TargetKind, state: "held" | "removed" | "restore", when: string) {
  const d = definition[kind];
  const redacted = state !== "restore";
  let value = redacted ? `'${state}'` : `'${d.visible}'`;
  if (!redacted && kind === "duo_request")
    value = reviewedDuoRequestState("t", "h");
  if (!redacted && kind === "lfg")
    value =
      "CASE WHEN t.expires_at<=clock_timestamp() OR h.prior_status IN ('closed','removed') OR t.status='closed' THEN 'closed' ELSE 'open' END";
  const extra =
    kind === "user"
      ? redacted
        ? ",display_name='Community player',bio=''"
        : ",display_name=coalesce(h.original_name,t.display_name),bio=coalesce(h.original_description,t.bio)"
      : kind === "room"
        ? redacted
          ? ",name='Room under review',description=''"
          : ",name=coalesce(h.original_name,t.name),description=coalesce(h.original_description,t.description)"
        : "";
  return `UPDATE ${d.table} t SET ${d.status}=${value}${extra} FROM wp_safety_holds h WHERE h.target_kind=$1 AND t.id=h.target_id AND t.id=$2 AND ${when}`;
}
const existsDecision = "EXISTS(SELECT 1 FROM wp_safety_decisions WHERE operation=$3::uuid)";
const clearHeld = "DELETE FROM wp_safety_holds WHERE target_kind=$1 AND target_id=$2 AND ";

export async function fileReport(user: User, kind: TargetKind, id: number, rule: Rule, note: string) {
  if (!(await rateLimit(user.id, "report", 20, 1440)))
    return {
      status: 429,
      error: "Your report limit has been reached. For an urgent concern use the safety contact.",
    };
  if ((kind === "lfg" || kind === "duo_request") && !(await canReportDuo(user.id, kind, id)))
    return { status: 404, error: "This item is unavailable." };
  const participant = kind === "duo_request";
  if (participant) {
    const [invitation] = await q`SELECT listing_id,sender_id FROM wp_duo_requests WHERE id=${id}`;
    if (!invitation) return { status: 404, error: "This item is unavailable." };
    // The sender reports the listing owner's conduct. A recipient reports the invitation's sender.
    if (Number(invitation.sender_id) === user.id) {
      kind = "lfg";
      id = Number(invitation.listing_id);
    }
  }
  const canView =
    kind === "post" || kind === "comment" ? await viewerCanSeePostOrComment(user.id, kind, id) : true;
  const sql = await getSql(),
    urgent = urgentRules.includes(rule);
  const args = [kind, id, user.id, rule, urgent ? "" : note.trim().slice(0, 300), canView, participant];
  const statements = [
    locking(sql, kind, id),
    sql(
      `INSERT INTO wp_reports(reporter_id,target_kind,target_id,category,reason)
      SELECT $3,$1,x.id,$4,$5 FROM (${currentTarget(kind)}) x
      WHERE $6 AND (x.status IN ('visible','open','pending','accepted','declined') OR ($7 AND x.status='closed')) AND x.author IS DISTINCT FROM $3
      AND ($7 OR NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=x.author) OR (b.blocker_id=x.author AND b.blocked_id=$3)))
      AND NOT EXISTS (SELECT 1 FROM (${activeReports}) r WHERE r.reporter_id=$3) RETURNING id`,
      args,
    ),
    sql(
      `UPDATE wp_reports SET category=$4,reason='' WHERE target_kind=$1 AND target_id=$2 AND reporter_id=$3 AND status='open'
      AND category<>ALL($5::text[]) AND $4=ANY($5::text[]) RETURNING id`,
      [kind, id, user.id, rule, urgentRules],
    ),
  ];
  if (urgent)
    statements.push(
      sql(
        `INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence)
    SELECT $3::uuid,$1,x.id,$4,left(concat_ws(E'\\n',x.excerpt,$5::text),1200) FROM (${currentTarget(kind)}) x WHERE EXISTS(
    SELECT 1 FROM (${activeReports}) r WHERE r.reporter_id=$6 AND r.category=$4)
    ON CONFLICT(target_kind,target_id) WHERE reviewed_at IS NULL DO NOTHING`,
        [kind, id, randomUUID(), rule, note.trim().slice(0, 300), user.id],
      ),
    );
  const hold = `(EXISTS(${activeUrgent}) OR (SELECT count(DISTINCT reporter_id) FROM (${activeReports}) r)>=3)`;
  statements.push(
    sql(rememberPrevious(kind) + hold + " ON CONFLICT DO NOTHING", [kind, id]),
    sql(
      changeState(
        kind,
        "held",
        `t.${definition[kind].status} IN ('visible','open','pending','accepted') AND ${hold}`,
      ),
      [kind, id],
    ),
    sql(`SELECT id FROM (${activeReports}) r WHERE r.reporter_id=$3 LIMIT 1`, [kind, id, user.id]),
  );
  const results = await sql.transaction(statements);
  return results.at(-1)?.length ? { status: 200 } : { status: 404, error: "This item is unavailable." };
}

const reviewPageSize = 25;
export const reviewAgeHours = [1, 4, 24, 72] as const;

type QueueRow = Row & { id: number; kind: string; priority: number; opened_at: string; time_key: string };
type QueueStats = { priority: number; total: number; oldest: string; pastMarker: number };

function readCursor(value: unknown, appeals: boolean) {
  if (typeof value !== "string" || value.length > 65) return null;
  const parts = /^([0-3])\.([0-9]{1,18})\.([a-z_]+)\.([1-9]\d{0,9})$/.exec(value);
  if (!parts) return null;
  const [, priority, micros, kind, rawId] = parts;
  const id = Number(rawId);
  const validSection = appeals ? priority === "3" && kind === "appeal"
    : priority !== "3" && targetKinds.includes(kind as TargetKind);
  return validSection && validId(id) ? [Number(priority), micros, kind, id] : null;
}

// The summary and page share one statement and one reviewer-specific visibility filter.
// Keyset paging retains the full database timestamp precision as text in the cursor.
async function queuePage(
  sql: Sql, source: string, staffId: number, owner: boolean, cursor: unknown[] | null, extra: unknown[] = [],
) {
  const [result] = await sql(`
    ${source}, timed AS (
      SELECT queue.*, (extract(epoch FROM opened_at)*1000000)::bigint AS opened_us FROM queue
    ), page AS (
      SELECT timed.*,opened_us::text AS time_key FROM timed
      WHERE $3::int IS NULL OR (priority,opened_us,kind,id)>($3::int,$4::bigint,$5::text,$6::int)
      ORDER BY priority,opened_us,kind,id LIMIT ${reviewPageSize + 1}
    ), summary AS (
      SELECT priority,count(*)::int AS total,min(opened_at) AS oldest,
        count(*) FILTER (WHERE opened_at <= now() - make_interval(hours=>(ARRAY[${reviewAgeHours.join(",")}])[priority+1]))::int AS "pastMarker"
      FROM queue GROUP BY priority
    )
    SELECT floor(extract(epoch FROM now()) * 1000)::bigint AS checked_ms,
      coalesce((SELECT jsonb_agg((to_jsonb(page)-'opened_us') ORDER BY priority,opened_us,kind,id) FROM page),'[]'::jsonb) AS items,
      coalesce((SELECT jsonb_agg(to_jsonb(summary) ORDER BY priority) FROM summary),'[]'::jsonb) AS summary`,
    [staffId, owner, ...(cursor ?? [null, null, null, null]), ...extra],
  );
  const items = result.items as QueueRow[];
  const rows = items.slice(0, reviewPageSize);
  const last = rows.at(-1);
  return {
    rows,
    next: items.length > reviewPageSize && last ? [last.priority, last.time_key, last.kind, last.id].join(".") : null,
    summary: result.summary as QueueStats[], checkedAtMs: Number(result.checked_ms),
  };
}

export async function reviewQueue(staff: User, cursors: { cases?: unknown; appeals?: unknown } = {}) {
  if (!isAdmin(staff.email) || isBanned(staff)) throw new Error("Staff access required");
  const owner = isSafetyOwner(staff.email), sql = await getSql();
  const targets = targetKinds.map(target).join(" UNION ALL ");
  const [cases, appeals] = await Promise.all([
    queuePage(sql, `WITH targets AS (${targets}), reports AS (
      SELECT target_kind,target_id,count(DISTINCT reporter_id)::int AS reports,min(created_at) AS opened,
        bool_or(reporter_id=$1) AS mine, (array_agg(left(reason,300) ORDER BY created_at DESC,id DESC) FILTER (WHERE reason<>''))[1] AS note, (array_agg(category ORDER BY CASE WHEN category=ANY($7::text[]) THEN 0
          WHEN category IN ('hate','fraud','harassment','sexual') THEN 1 ELSE 2 END,created_at,id))[1] AS rule
      FROM wp_reports WHERE status='open' GROUP BY target_kind,target_id), queue AS (
      SELECT t.kind,t.id,t.releasable,u.receipt,u.release_requested_by,coalesce(r.reports,0) AS reports,coalesce(u.rule,r.rule,'other') AS rule,
        CASE WHEN u.receipt IS NULL THEN r.note END AS note,
        CASE WHEN u.receipt IS NULL THEN left(coalesce(nullif(concat_ws(' ',h.original_name,h.original_description),''),t.excerpt),750) END AS excerpt,
        CASE WHEN u.receipt IS NULL THEN t.link END AS link,
        CASE WHEN u.receipt IS NOT NULL THEN 0 WHEN r.rule IN ('hate','fraud','harassment','sexual') THEN 1 ELSE 2 END AS priority,
        coalesce(least(r.opened,u.opened_at,
          CASE WHEN t.status='held' AND (h.prior_status IS NULL OR h.prior_status='held') THEN t.created_at END),t.created_at) AS opened_at
      FROM targets t LEFT JOIN reports r ON r.target_kind=t.kind AND r.target_id=t.id
      LEFT JOIN wp_safety_holds h ON h.target_kind=t.kind AND h.target_id=t.id
      LEFT JOIN wp_safety_urgent u ON u.target_kind=t.kind AND u.target_id=t.id AND u.reviewed_at IS NULL
      WHERE (t.status='held' OR r.reports>0 OR u.receipt IS NOT NULL) AND t.author IS DISTINCT FROM $1
        AND NOT coalesce(r.mine,false) AND ($2 OR u.receipt IS NULL))`,
      staff.id, owner, readCursor(cursors.cases, false), [urgentRules]),
    queuePage(sql, `WITH queue AS (
      SELECT a.id,'appeal'::text AS kind,3 AS priority,a.created_at AS opened_at,d.rule,d.restricted,
        CASE WHEN d.restricted THEN NULL ELSE a.message END AS message
      FROM wp_safety_appeals a JOIN wp_safety_decisions d ON d.id=a.decision_id
      WHERE a.status='pending' AND d.actor_id<>$1 AND a.applicant_id<>$1 AND ($2 OR NOT d.restricted))`,
      staff.id, owner, readCursor(cursors.appeals, true)),
  ]);
  return {
    cases: cases.rows, appeals: appeals.rows, nextCases: cases.next, nextAppeals: appeals.next,
    summary: [...cases.summary, ...appeals.summary], checkedAtMs: cases.checkedAtMs,
  };
}

/** A moderator can route a held item to a trained responder without rendering it in another general queue. */
export async function escalateCase(staff: User, kind: TargetKind, id: number, rule: Rule) {
  if (!isAdmin(staff.email) || isBanned(staff) || !urgentRules.includes(rule)) return false;
  const sql = await getSql();
  const steps = [
    locking(sql, kind, id),
    sql(
      `INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence)
      SELECT $3::uuid,$1,x.id,$4,x.excerpt FROM (${currentTarget(kind)}) x WHERE x.author IS DISTINCT FROM $5::int
      AND (x.status='held' OR EXISTS(${activeReports})) ON CONFLICT(target_kind,target_id) WHERE reviewed_at IS NULL DO NOTHING RETURNING receipt`,
      [kind, id, randomUUID(), rule, staff.id],
    ),
  ];
  if (kind === "user" && rule === "child_safety")
    steps.push(sql(
      `SELECT wp_capture_reported_avatar($2, c.receipt) FROM (${activeUrgent}) c WHERE EXISTS(
        SELECT 1 FROM (${currentTarget(kind)}) x WHERE x.author IS DISTINCT FROM $3::int
        AND (x.status='held' OR EXISTS(${activeReports})))`,
      [kind, id, staff.id],
    ));
  steps.push(
    sql(rememberPrevious(kind) + `EXISTS(${activeUrgent}) ON CONFLICT DO NOTHING`, [kind, id]),
    sql(
      changeState(
        kind,
        "held",
        `EXISTS(${activeUrgent}) AND t.${definition[kind].status} IN ('visible','pending','open','accepted')`,
      ),
      [kind, id],
    ),
  );
  const rows = await sql.transaction(steps);
  return rows[1].length > 0;
}

export async function resolveCase(staff: User, kind: TargetKind, id: number, action: Decision, rule: Rule) {
  if (!isAdmin(staff.email) || isBanned(staff) || (urgentRules.includes(rule) && !isSafetyOwner(staff.email)))
    return false;
  const sql = await getSql(),
    op = randomUUID(),
    removing = action !== "dismiss",
    duration = days[action];
  const args = [kind, id, op, staff.id, action, rule, isSafetyOwner(staff.email), duration, urgentRules];
  const create = `INSERT INTO wp_safety_decisions(operation,target_kind,target_id,author_id,actor_id,action,rule,evidence,restricted,ends_at)
    SELECT $3::uuid,$1,x.id,x.author,$4,$5,$6,
      CASE WHEN u.receipt IS NOT NULL THEN NULL ELSE left(coalesce(nullif(concat_ws(' ',h.original_name,h.original_description),''),x.excerpt),500) END,
      u.receipt IS NOT NULL, CASE WHEN $5='ban' THEN '9999-12-31'::timestamptz WHEN $8::int>0 THEN now()+make_interval(days=>$8) END
    FROM (${currentTarget(kind)}) x LEFT JOIN wp_safety_urgent u ON u.target_kind=$1 AND u.target_id=x.id AND u.reviewed_at IS NULL
    LEFT JOIN wp_safety_holds h ON h.target_kind=$1 AND h.target_id=x.id
    WHERE (x.status='held' OR EXISTS(${activeReports}) OR u.receipt IS NOT NULL)
      AND x.author IS DISTINCT FROM $4::int AND ($8=0 AND $5<>'ban' OR x.author IS NOT NULL)
      AND ($7 OR u.receipt IS NULL) AND (NOT ($6=ANY($9::text[])) OR u.receipt IS NOT NULL)
      AND (u.receipt IS NULL OR $5<>'dismiss' OR (u.release_requested_by IS NOT NULL AND u.release_requested_by<>$4))
      AND ($5<>'dismiss' OR x.releasable)
      AND NOT EXISTS(SELECT 1 FROM (${activeReports}) r WHERE r.reporter_id=$4)
    RETURNING id`;
  const locks = [
    locking(sql, kind, id),
    ...(!removing ? duoRestorationLocks(sql, kind, id) : []),
  ];
  const steps = [
    ...locks,
    sql(create, args),
    sql(rememberPrevious(kind) + existsDecision + " ON CONFLICT DO NOTHING", [kind, id, op]),
    sql(changeState(kind, removing ? "removed" : "restore", existsDecision), removing ? [kind, id, op] : restoreArgs(kind, id, op)),
    sql`UPDATE wp_reports r SET status=${removing ? "actioned" : "dismissed"},resolved_at=now(),decision_id=d.id,
      resolution=${removing ? "A moderator acted on your report." : "The review found no violation."} FROM wp_safety_decisions d
      WHERE d.operation=${op} AND r.target_kind=d.target_kind AND r.target_id=d.target_id AND r.status='open'`,
    sql`UPDATE wp_safety_urgent SET reviewed_at=now() WHERE target_kind=${kind} AND target_id=${id}
      AND reviewed_at IS NULL AND EXISTS(SELECT 1 FROM wp_safety_decisions WHERE operation=${op})`,
  ];
  if (!removing) steps.push(sql(clearHeld + existsDecision, [kind, id, op]));
  if (removing)
    steps.push(
      sql`SELECT u.id FROM wp_users u JOIN wp_safety_decisions d ON u.id=d.author_id WHERE d.operation=${op} FOR UPDATE OF u`,
      sql`INSERT INTO wp_safety_prior_restrictions(user_id,ends_at) SELECT u.id,u.banned_until FROM wp_users u
      JOIN wp_safety_decisions d ON d.author_id=u.id WHERE d.operation=${op} ON CONFLICT DO NOTHING`,
      sql`UPDATE wp_users u SET banned_until=greatest(u.banned_until,d.ends_at),strike_count=strike_count+1 FROM wp_safety_decisions d
      WHERE d.operation=${op} AND u.id=d.author_id`,
    );
  if (action === "dismiss" && isSafetyOwner(staff.email))
    steps.push(
      sql(
        `UPDATE wp_safety_urgent u SET release_requested_by=$3
    WHERE u.target_kind=$1 AND u.target_id=$2 AND u.reviewed_at IS NULL AND u.release_requested_by IS NULL
      AND EXISTS (SELECT 1 FROM (${currentTarget(kind)}) x WHERE x.releasable AND x.author IS DISTINCT FROM $3::int)
      AND NOT EXISTS (SELECT 1 FROM (${activeReports}) r WHERE r.reporter_id=$3) RETURNING receipt`,
        [kind, id, staff.id],
      ),
    );
  const rows = await sql.transaction(steps);
  if (rows[locks.length].length) return true;
  if (action === "dismiss" && isSafetyOwner(staff.email) && rows.at(-1)?.length) return "second_review";
  return false;
}

export async function ownDecisions(userId: number) {
  return q`SELECT d.id,d.action,d.rule,d.evidence,d.restricted,d.ends_at,d.created_at,d.revoked_at,a.status AS appeal,a.reason
    FROM wp_safety_decisions d LEFT JOIN wp_safety_appeals a ON a.decision_id=d.id
    WHERE d.author_id=${userId} AND d.action<>'dismiss' ORDER BY d.created_at DESC LIMIT 50`;
}
export async function submitAppeal(user: User, id: number, message: string) {
  if (!(await rateLimit(user.id, "appeal", 12, 1440))) return false;
  const rows = await q`INSERT INTO wp_safety_appeals(decision_id,applicant_id,message)
    SELECT id,${user.id},${message} FROM wp_safety_decisions WHERE id=${id} AND author_id=${user.id} AND revoked_at IS NULL AND action<>'dismiss'
    ON CONFLICT(decision_id) DO NOTHING RETURNING id`;
  return !!rows.length;
}

export async function reviewAppeal(staff: User, appealId: number, overturn: boolean, reason: string) {
  if (!isAdmin(staff.email) || isBanned(staff)) return false;
  const sql = await getSql();
  const [info] =
    await sql`SELECT d.id,d.target_kind,d.target_id,d.author_id FROM wp_safety_appeals a JOIN wp_safety_decisions d ON d.id=a.decision_id WHERE a.id=${appealId}`;
  if (!info || !targetKinds.includes(info.target_kind as TargetKind)) return false;
  const kind = info.target_kind as TargetKind,
    id = Number(info.target_id),
    op = randomUUID();
  // A unique review nonce lets later statements distinguish this attempt from a concurrent review.
  const locks = [
    locking(sql, kind, id),
    ...(overturn ? duoRestorationLocks(sql, kind, id) : []),
  ];
  const result = await sql.transaction([
    ...locks,
    sql`SELECT id FROM wp_users WHERE id=${Number(info.author_id)} FOR UPDATE`,
    sql`UPDATE wp_safety_appeals a SET status=${overturn ? "overturned" : "upheld"},reviewer_id=${staff.id},decided_at=now(),
      reason=${reason},review_operation=${op} FROM wp_safety_decisions d WHERE a.id=${appealId} AND a.status='pending'
      AND d.id=a.decision_id AND d.actor_id<>${staff.id} AND a.applicant_id<>${staff.id}
      AND (${isSafetyOwner(staff.email)} OR NOT d.restricted) RETURNING a.id`,
    sql`UPDATE wp_safety_decisions d SET revoked_at=now() FROM wp_safety_appeals a WHERE a.review_operation=${op} AND a.status='overturned' AND d.id=a.decision_id`,
    // An overturned restricted sanction ends the account restriction immediately. The
    // item is returned to the responder queue so a second owner can clear publication.
    sql`INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence)
      SELECT ${randomUUID()}::uuid,d.target_kind,d.target_id,d.rule,'Review previous evidence receipt '||prior.receipt::text
      FROM wp_safety_appeals a JOIN wp_safety_decisions d ON d.id=a.decision_id
      JOIN LATERAL (SELECT receipt FROM wp_safety_urgent u WHERE u.target_kind=d.target_kind AND u.target_id=d.target_id
        ORDER BY opened_at DESC LIMIT 1) prior ON true
      WHERE a.review_operation=${op} AND a.status='overturned' AND d.restricted
        AND NOT EXISTS(SELECT 1 FROM wp_safety_decisions other WHERE other.target_kind=d.target_kind AND other.target_id=d.target_id
          AND other.action<>'dismiss' AND other.revoked_at IS NULL)
      ON CONFLICT(target_kind,target_id) WHERE reviewed_at IS NULL DO NOTHING`,
    sql(
      changeState(
        kind,
        "held",
        `EXISTS(SELECT 1 FROM wp_safety_appeals WHERE review_operation=$3::uuid AND status='overturned')
      AND EXISTS(${activeUrgent})`,
      ),
      [kind, id, op],
    ),
    sql`UPDATE wp_users u SET strike_count=greatest(0,strike_count-1),
      banned_until=greatest(b.ends_at,(SELECT max(ends_at) FROM wp_safety_decisions WHERE author_id=u.id AND revoked_at IS NULL))
      FROM wp_safety_prior_restrictions b WHERE b.user_id=u.id AND EXISTS(SELECT 1 FROM wp_safety_appeals a WHERE a.applicant_id=u.id AND a.review_operation=${op} AND a.status='overturned')`,
    sql(
      changeState(
        kind,
        "restore",
        `EXISTS(SELECT 1 FROM wp_safety_appeals a JOIN wp_safety_decisions d ON d.id=a.decision_id
      WHERE a.review_operation=$3::uuid AND a.status='overturned' AND NOT d.restricted)
      AND NOT EXISTS(SELECT 1 FROM wp_safety_decisions WHERE target_kind=$1 AND target_id=$2 AND action<>'dismiss' AND revoked_at IS NULL)
      AND NOT EXISTS(${activeReports}) AND EXISTS(SELECT 1 FROM (${currentTarget(kind)}) x WHERE x.releasable)`,
      ),
      restoreArgs(kind, id, op),
    ),
    sql`UPDATE wp_reports r SET status='corrected',resolution='The decision changed after an appeal.'
      FROM wp_safety_appeals a WHERE a.review_operation=${op} AND a.status='overturned' AND r.decision_id=a.decision_id`,
    sql(
      clearHeld +
        `EXISTS(SELECT 1 FROM wp_safety_appeals WHERE review_operation=$3::uuid AND status='overturned')
      AND EXISTS(SELECT 1 FROM (${currentTarget(kind)}) x WHERE x.status NOT IN ('held','removed'))`,
      [kind, id, op],
    ),
  ]);
  return result[locks.length + 1].length > 0;
}
export const safeString = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));

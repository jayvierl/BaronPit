import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql, queryRows } from "./db";
import { inProbation } from "./account-policy";
import { validId } from "./ids";

/**
 * Server-to-server moderation queue for the automated reviewer
 * (moderation-automation spec). The admin UI stays the system of record:
 * decisions here apply the same status transitions a staff dismissal or
 * removal applies to a held post/comment, close its open reports with the
 * same resolutions, and leave a wp_mod_decisions audit row per decision.
 * Targets carrying an unreviewed urgent safety receipt are never decidable
 * here — those stay with the safety owner.
 */

export type ModerationKeyCheck = "ok" | "unconfigured" | "invalid";

/** Constant-time key check. An unset key disables the API; it never fails open. */
export function checkModerationKey(req: Request): ModerationKeyCheck {
  const expected = process.env.MODERATION_API_KEY?.trim();
  if (!expected) return "unconfigured";
  const provided = req.headers.get("x-moderation-key") ?? "";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) ? "ok" : "invalid";
}

export interface HeldItem {
  targetType: "post" | "comment" | "media";
  targetId: number | string;
  state: "held" | "flagged";
  kind: string | null;
  body: string | null;
  postId: number | null;
  author: {
    id: number;
    displayName: string;
    email: string;
    createdAt: string;
    lowTrust: boolean;
  } | null;
  score: number | null;
  hits: string[];
  reports: number;
  escalated: boolean;
  createdAt: string;
}

type Row = Record<string, unknown>;

function authorOf(r: Row) {
  if (r.author_id == null) return null;
  const createdAt = String(r.author_created_at);
  return {
    id: Number(r.author_id),
    displayName: String(r.author_name ?? ""),
    email: String(r.author_email ?? ""),
    createdAt,
    lowTrust: inProbation(createdAt),
  };
}

function hitsOf(r: Row): string[] {
  return typeof r.detail === "string" && r.detail ? r.detail.split(",").filter(Boolean) : [];
}

const targetSelect = (kind: "post" | "comment") => {
  const table = kind === "post" ? "wp_posts" : "wp_comments";
  const extra = kind === "post" ? "t.kind AS kind, NULL::int AS post_id" : "NULL::text AS kind, t.post_id";
  return `SELECT '${kind}' AS target_type, t.id, t.body, t.status, t.created_at, ${extra},
    u.id AS author_id, u.display_name AS author_name, u.email AS author_email, u.created_at AS author_created_at,
    ml.score, ml.detail,
    (SELECT count(DISTINCT reporter_id)::int FROM wp_reports r WHERE r.target_kind='${kind}' AND r.target_id=t.id AND r.status='open') AS reports,
    EXISTS(SELECT 1 FROM wp_safety_urgent u2 WHERE u2.target_kind='${kind}' AND u2.target_id=t.id AND u2.reviewed_at IS NULL) AS escalated,
    CASE WHEN t.status='held' THEN 'held' ELSE 'flagged' END AS state
  FROM ${table} t JOIN wp_users u ON u.id=t.author_id
  LEFT JOIN LATERAL (
    SELECT score, detail FROM wp_mod_log
    WHERE target_kind='${kind}' AND target_id=t.id AND action IN ('hold','flag')
    ORDER BY created_at DESC, id DESC LIMIT 1
  ) ml ON true
  WHERE (t.status='held' OR (t.status='visible'
    AND EXISTS(SELECT 1 FROM wp_mod_log f WHERE f.target_kind='${kind}' AND f.target_id=t.id AND f.action='flag')
    AND NOT EXISTS(SELECT 1 FROM wp_mod_decisions d WHERE d.target_kind='${kind}' AND d.target_id=t.id)))`;
};

export async function listHeldItems(limit = 100): Promise<HeldItem[]> {
  const cap = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : 100;
  const [posts, comments, media] = await Promise.all([
    queryRows(`${targetSelect("post")} AND t.kind<>'media' ORDER BY t.created_at ASC LIMIT ${cap}`, []),
    queryRows(`${targetSelect("comment")} ORDER BY t.created_at ASC LIMIT ${cap}`, []),
    // Profile photos waiting on a human are listed as metadata only. The
    // image bytes never leave the admin photo queue, where the reviewer of
    // record actually sees the photo before deciding.
    queryRows(`SELECT p.id, p.created_at, u.id AS author_id, u.display_name AS author_name,
      u.email AS author_email, u.created_at AS author_created_at
      FROM wp_profile_photos p LEFT JOIN wp_users u ON u.id=p.user_id
      WHERE p.status='held' AND p.active AND p.automated_clear AND p.needs_human AND p.expires_at>now()
      ORDER BY p.created_at ASC LIMIT ${cap}`, []),
  ]);
  const mapTarget = (r: Row): HeldItem => ({
    targetType: r.target_type as "post" | "comment",
    targetId: Number(r.id),
    state: r.state as "held" | "flagged",
    kind: r.kind == null ? null : String(r.kind),
    // Escalated targets are the safety owner's; never serve their content here.
    body: r.escalated === true ? null : String(r.body ?? ""),
    postId: r.post_id == null ? null : Number(r.post_id),
    author: authorOf(r),
    score: r.score == null ? null : Number(r.score),
    hits: hitsOf(r),
    reports: Number(r.reports ?? 0),
    escalated: r.escalated === true,
    createdAt: new Date(String(r.created_at)).toISOString(),
  });
  return [
    ...posts.map(mapTarget),
    ...comments.map(mapTarget),
    ...media.map((r: Row): HeldItem => ({
      targetType: "media",
      targetId: String(r.id),
      state: "held",
      kind: "profile_photo",
      body: null,
      postId: null,
      author: authorOf(r),
      score: null,
      hits: [],
      reports: 0,
      escalated: false,
      createdAt: new Date(String(r.created_at)).toISOString(),
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type DecideResult =
  | { ok: true; priorStatus: string; newStatus: string }
  | { ok: false; status: number; error: string };

const TABLES = { post: "wp_posts", comment: "wp_comments" } as const;

// Same publication eligibility the admin queue applies to posts: media has
// no publication path, and clips publish only when flagged for clip review.
const releasable = (kind: string) =>
  kind === "post"
    ? " AND (t.kind NOT IN ('media','clip') OR (t.kind='clip' AND t.clip_review_required))"
    : "";

export async function decideModerationTarget(input: {
  targetType?: unknown;
  targetId?: unknown;
  decision?: unknown;
  reason?: unknown;
}): Promise<DecideResult> {
  const kind = input.targetType;
  if (kind !== "post" && kind !== "comment" && kind !== "media")
    return { ok: false, status: 400, error: "Choose a valid moderation target." };
  if (kind === "media")
    return {
      ok: false,
      status: 409,
      error: "Profile photos are decided in the admin photo queue, where the reviewer sees the image.",
    };
  if (!validId(input.targetId))
    return { ok: false, status: 400, error: "Choose a valid moderation target." };
  if (input.decision !== "approve" && input.decision !== "deny")
    return { ok: false, status: 400, error: "Choose approve or deny." };
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 400)
    return { ok: false, status: 400, error: "Cite the criteria line behind the decision (up to 400 characters)." };

  const id = input.targetId;
  const approve = input.decision === "approve";
  const newStatus = approve ? "visible" : "removed";
  const table = TABLES[kind];
  const sql = await getSql();
  const op = randomUUID();
  const args = [kind, id, op, input.decision, reason, newStatus];
  const rows = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"wp-review:" + kind + ":" + id}))`,
    sql(
      `INSERT INTO wp_mod_decisions(operation,target_kind,target_id,decision,reason,actor,prior_status,new_status)
      SELECT $3::uuid,$1,t.id,$4,$5,'lyris',t.status,$6 FROM ${table} t
      WHERE t.id=$2${releasable(kind)}
        AND (t.status='held' OR (t.status='visible'
          AND EXISTS(SELECT 1 FROM wp_mod_log f WHERE f.target_kind=$1 AND f.target_id=$2 AND f.action='flag')
          AND NOT EXISTS(SELECT 1 FROM wp_mod_decisions d WHERE d.target_kind=$1 AND d.target_id=$2)))
        AND NOT EXISTS(SELECT 1 FROM wp_safety_urgent u WHERE u.target_kind=$1 AND u.target_id=$2 AND u.reviewed_at IS NULL)
      RETURNING prior_status`,
      args,
    ),
    sql(
      `UPDATE ${table} t SET status=d.new_status FROM wp_mod_decisions d
      WHERE d.operation=$1::uuid AND t.id=d.target_id AND t.status=d.prior_status`,
      [op],
    ),
    // Same report resolutions the staff queue writes on dismiss / removal.
    sql(
      `UPDATE wp_reports r SET status=$4,resolved_at=now(),resolution=$5
      WHERE r.target_kind=$1 AND r.target_id=$2 AND r.status='open'
        AND EXISTS(SELECT 1 FROM wp_mod_decisions WHERE operation=$3::uuid)`,
      [kind, id, op, approve ? "dismissed" : "actioned",
        approve ? "The review found no violation." : "A moderator acted on your report."],
    ),
    ...(approve
      ? [
          sql(
            `DELETE FROM wp_safety_holds WHERE target_kind=$1 AND target_id=$2
            AND EXISTS(SELECT 1 FROM wp_mod_decisions WHERE operation=$3::uuid)`,
            [kind, id, op],
          ),
        ]
      : []),
  ]);
  const decided = rows[1] as Row[];
  if (decided.length)
    return { ok: true, priorStatus: String(decided[0].prior_status), newStatus };
  // Nothing applied. Classify the refusal from the current state.
  const [current] = await queryRows(
    `SELECT t.status, EXISTS(SELECT 1 FROM wp_safety_urgent u WHERE u.target_kind=$1 AND u.target_id=$2 AND u.reviewed_at IS NULL) AS escalated
     FROM ${table} t WHERE t.id=$2`,
    [kind, id],
  );
  if (!current) return { ok: false, status: 404, error: "This item is unavailable." };
  if (current.escalated === true)
    return { ok: false, status: 409, error: "This item is escalated to the safety owner and is not decidable here." };
  return { ok: false, status: 409, error: "This item is no longer awaiting a decision." };
}
